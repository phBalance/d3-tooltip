import { chooseHighestContrastColour } from "@phbalance/contrast-colour";
import { oneLine } from "common-tags";
import { mouse, Selection } from "d3-selection";

export type ITooltipConfigDataFn<DatumType> = (d: DatumType) => string | undefined;

export interface ITooltipConfig<DatumType> {
	rounded: boolean;

	bubbleWidth: number;
	bubbleHeight: number;
	bubbleTip?: {tipOffset: number, h: number, edgeOffset: number}; // Tip dimensions are not included in bubbleHeight or bubbleWidth

	bubbleStroke?: string; // Will be biggest contrast colour if not provided
	bubbleStrokeWidth?: number; // bubbleWidth / 100 if not provided.

	chartWidth: number;
	chartHeight: number;

	backgroundColour: string;
	backgroundOpacity: number;

	getData: ITooltipConfigDataFn<DatumType>;
}

export interface ITooltipBubbleConfig {
	polyWidth: number;
	polyHeight: number;
	tipOffset: number;
	tipPointOffset: number;
	tipHeight: number;
	pointDown: boolean;
	tipOnRight: boolean;
}

// Blink (Chrome) has an issue with foreignObjects and screen zooming (or high density screens). See:
// tslint:disable-next-line
// https://bugs.chromium.org/p/chromium/issues/detail?id=738022&q=chrome%20svg%20devicePixelRatio&colspec=ID%20Pri%20M%20Stars%20ReleaseBlock%20Component%20Status%20Owner%20Summary%20OS%20Modified
// To compensate for this, we need to factor back to CSS pixels if this behaviour is present.

// Create 2 "hidden" areas that we can use to compare sizing.
const bugClassName = "tooltip-fo-zoom-bug-detect";
const divContent = "The size should match";
const bugWidth = "100";
const bugHeight = "1";
const divStyle = "all: unset; visibility:hidden; position: absolute";
const div = document.createElement("div");
div.setAttribute("class", bugClassName);
div.setAttribute("style", "all: unset; visibility:hidden; position: absolute; display: block");
div.setAttribute("width", bugWidth);
div.innerHTML = divContent;

document.body.appendChild(div);

const svgDiv = document.createElement("div");
svgDiv.setAttribute("style", "all: unset; visibility:hidden; position: absolute; display: block");
svgDiv.setAttribute("class", bugClassName);

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
fo.setAttribute("width", bugWidth);
fo.setAttribute("height", bugHeight);
svg.appendChild(fo);
const foDiv = document.createElement("div");
foDiv.setAttribute("style", divStyle);
foDiv.innerHTML = divContent;
fo.appendChild(foDiv);

svgDiv.appendChild(svg);
svg.setAttribute("style", divStyle);

document.body.appendChild(svgDiv);

function foreignObjectZoomBugCorrectionFactor(): number {
	const foDivBound = foDiv.getBoundingClientRect();
	const divBound = div.getBoundingClientRect();

	// FIXME: Why is there this a magic multiple of 2?
	// Calculate the difference and scale things by this value.
	// It would have been nice to use devicePixelRatio, but that doesn't work on Safari.
	let zoomMultiple = foDivBound.height / (2 * divBound.height);

	// console.error(`fo: ${JSON.stringify(foDivBound.height)} div: ${JSON.stringify(divBound.height)}
	// 	ratio: ${window.devicePixelRatio} multiple: ${zoomMultiple}`);

	// FIXME: Firefox calculates things incorrectly when zoom < 80%. A bug for sure. Might have to do with their poor text kerning.
	//        I can't see an easy way to work around this. Using the work around for chrome fixes helps at some, but not all, zoom values.
	// FIXME: Safari calculates things incorrectly when zoom < 75%.

	// FIXME: Chrome doesn't agree between devicePixelRatio and zoomMultiple when zoom < 50%! But, it does >= 50% to 500%
	if(zoomMultiple < 0.5 && window.devicePixelRatio < 0.5) {
		zoomMultiple = window.devicePixelRatio;
	}

	return zoomMultiple;
}

// Expected to be used with d3.
// NOTE: You must wrap your html in a <div> so that calculations of size can be done. Also, it gives a good anchor for applying
//       padding, and other styling, can be applied via CSS.
export class Tooltip<DatumType> {
	private static getBoundingRect(content: SVGElement, rootNode: SVGSVGElement): {width: number, height: number} {
		// Get size in element based coords
		const boundingRect = content.getBoundingClientRect();

		// Transform to SVG coords
		const pt1 = rootNode.createSVGPoint();
		const pt2 = rootNode.createSVGPoint();

		pt1.x = boundingRect.left;
		pt1.y = boundingRect.top;
		pt2.x = boundingRect.right;
		pt2.y = boundingRect.bottom;

		const screenCtm = rootNode.getScreenCTM();
		console.assert(screenCtm, "null screenCtm - using identity");
		const ctmInverse = screenCtm ? screenCtm.inverse() : rootNode.createSVGMatrix();

		const svgPt1 = pt1.matrixTransform(ctmInverse);
		const svgPt2 = pt2.matrixTransform(ctmInverse);

		// Height is difference between the 2 transformed y values modified by
		// any multiplication, due to Blink bug, in the CSS pixel size to screen pixels from zooming.
		const zoomFactor = foreignObjectZoomBugCorrectionFactor();

		const bounds = {
			height: (svgPt2.y - svgPt1.y) / zoomFactor,
			width: (svgPt2.x - svgPt1.x) / zoomFactor,
		};

		return bounds;
	}

	private readonly tooltipArea: Selection<SVGElement, unknown, null, undefined>;
	private readonly rootSelection: SVGSVGElement;
	private readonly bubbleWidth: number;
	private readonly bubbleHeight: number;
	private readonly chartWidth: number;
	private readonly chartHeight: number;
	private readonly bubbleOpacity: number;
	private readonly bubbleBackground: string;
	private readonly bubbleStroke: string;
	private readonly bubbleStrokeWidth: string;
	private readonly bubbleTip: {tipOffset: number, h: number, edgeOffset: number};
	private readonly bubble: ITooltipBubble;
	private readonly getData: ITooltipConfigDataFn<DatumType>;

	private calculatedHeight: number;
	private calculatedWidth: number;

	// If bubbleHeight < 0 then go with a dynamically calculated bubble height.
	constructor(rootSelection: Selection<SVGSVGElement, unknown, null, undefined>, config: ITooltipConfig<DatumType>) {
		// We'll generate an exception if rootSelection is null, so let's just let TypeScript ignore that possibility.
		this.rootSelection = rootSelection.node() as NonNullable<SVGSVGElement>;

		// Reuse an existing group where it exists. Create if it doesn't.
		this.tooltipArea = rootSelection
			.select("g.tooltip-group");

		if(this.tooltipArea.empty()) {
			this.tooltipArea = (rootSelection as any)
				.append("g")
					.attr("class", "tooltip-group");
		}

		this.chartWidth = config.chartWidth;
		this.chartHeight = config.chartHeight;

		this.bubbleWidth = config.bubbleWidth;
		this.bubbleHeight = config.bubbleHeight;
		this.bubbleBackground = config.backgroundColour;
		this.bubbleOpacity = config.backgroundOpacity;
		this.bubbleStroke = config.bubbleStroke || chooseHighestContrastColour(config.backgroundColour, config.backgroundOpacity);
		this.bubbleStrokeWidth = (config.bubbleStrokeWidth || (this.bubbleWidth / 100)).toString();
		this.bubble = config.rounded ? ROUNDED_BUBBLE : SQUARE_BUBBLE;
		this.bubbleTip = Object.assign({tipOffset: (3 / 4 * 50), h: 10, edgeOffset: 50}, config.bubbleTip);

		this.getData = config.getData;

		this.calculatedHeight = 0;
		this.calculatedWidth = 0;
	}

	public mouseoverHandler() {
		const objThis = this;

		// NOTE: This function will be called with different "this" - it is not the object this
		return function(d: DatumType) {
			// console.log(`d3Event: ${d3.event}`);
			const tooltip = objThis.getData(d);
			if(tooltip) {
				const [x, y] = mouse(objThis.rootSelection);
				// console.log(`mouseover event at ${x}, ${y}`);

				const testContent = objThis.tooltipArea
					.append("foreignObject")
						.attr("class", "svg-tooltip-content")
						.attr("pointer-events", "none")
						.attr("width", objThis.bubbleWidth)
						.attr("height", 1) // Firefox, at this point, requires height >= 1 to calculate children correctly.
						.html(tooltip);

				if(objThis.bubbleHeight >= 0) {
					objThis.calculatedHeight = objThis.bubbleHeight;
					objThis.calculatedWidth = objThis.bubbleWidth;
				} else {
					const foDivNode = testContent.select("div").node() as SVGElement;

					if(foDivNode) {
						const bounds = Tooltip.getBoundingRect(foDivNode, objThis.rootSelection);
						objThis.calculatedHeight = bounds.height;
						objThis.calculatedWidth = bounds.width;
					} else {
						console.error(`invalid tooltip HTML construction - must have a wrapping div`);
						objThis.calculatedHeight = objThis.bubbleHeight;
						objThis.calculatedWidth = objThis.bubbleWidth;
					}
				}

				objThis.createTooltip();
				objThis.positionTooltip(x, y);
			}
		};
	}

	public mousemoveHandler() {
		const objThis = this;

		// NOTE: This function will be called with different "this" - it is not the object this
		return function(d: DatumType) {
			const tooltip = objThis.getData(d);
			if(tooltip) {
				const [x, y] = mouse(objThis.rootSelection);
				// console.log(`mousemove event at ${x}, ${y}`);

				objThis.positionTooltip(x, y);
			}
		};
	}

	public mouseoutHandler() {
		const objThis = this;

		// NOTE: This function will be called with different "this" which is not the object this
		return function(d: DatumType) {
			const tooltip = objThis.getData(d);
			if(tooltip) {
				const [x, y] = mouse(objThis.rootSelection);
				// console.log(`mouseout event at ${x}, ${y}`);

				objThis.calculatedHeight = 0;
				objThis.calculatedWidth = 0;

				objThis.tooltipArea
					.select("foreignObject")
						.remove();

				objThis.tooltipArea
					.select("path")
						.remove();
			}
		};
	}

	private generateBubbleConfig(invertVert: boolean, invertHoriz: boolean): ITooltipBubbleConfig {
		return {
			pointDown: invertVert,
			polyHeight: this.calculatedHeight, // excluding tip
			polyWidth: this.calculatedWidth,
			tipHeight: this.bubbleTip.h,
			tipOffset: this.bubbleTip.edgeOffset,
			tipOnRight: invertHoriz,
			tipPointOffset: this.bubbleTip.tipOffset,
		};
	}

	// Create the bubble
	private createTooltip(): void {
		this.tooltipArea
			.select("foreignObject")
			.attr("height", this.calculatedHeight)
			.attr("width", this.calculatedWidth);

		this.tooltipArea
			.insert("path", "foreignObject")
				.attr("class", "svg-tooltip-outline")
				.attr("pointer-events", "none")
				.attr("fill", this.bubbleBackground)
				.attr("opacity", this.bubbleOpacity)
				.attr("stroke", this.bubbleStroke)
				.attr("stroke-width", this.bubbleStrokeWidth)
				.attr("stroke-linecap", "square")
				.attr("stroke-linejoin", "miter");
	}

	// Position the tooltip to keep inside the chart
	private positionTooltip(x: number, y: number): void {
		let invertVert = false;
		let invertHoriz = false;

		if(x + this.calculatedWidth > this.chartWidth) {
			x = x - this.calculatedWidth;
			invertHoriz = true;
		}

		if(y + this.calculatedHeight + this.bubbleTip.h > this.chartHeight) {
			y = y - this.calculatedHeight;
			invertVert = true;
		}

		this.tooltipArea
			.select("path")
			.attr("d", this.bubble.outline(this.generateBubbleConfig(invertVert, invertHoriz)))
			.attr("transform", `translate(${(x + (invertHoriz ? this.bubbleTip.tipOffset : -this.bubbleTip.tipOffset))},${(y + (invertVert ? -this.bubbleTip.h : this.bubbleTip.h))})`);

		this.tooltipArea
			.select("foreignObject")
			.attr("x", x + (invertHoriz ? this.bubbleTip.tipOffset : -this.bubbleTip.tipOffset))
			.attr("y", y + (invertVert ? -this.bubbleTip.h : this.bubbleTip.h));
	}
}

interface ITooltipBubble {
	outline(config: ITooltipBubbleConfig): string;
}

const ROUNDED_BUBBLE: ITooltipBubble = {
	outline(config: ITooltipBubbleConfig): string {
		const smallerDim = Math.min(config.polyHeight, config.polyWidth);
		const radius = smallerDim < 100 ? smallerDim / 5 : 10;

		if(!config.pointDown && !config.tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${config.polyHeight - radius}
				Q 0 ${config.polyHeight}, ${radius} ${config.polyHeight}
				L ${config.polyWidth - radius} ${config.polyHeight}
				Q ${config.polyWidth} ${config.polyHeight}, ${config.polyWidth} ${config.polyHeight - radius}
				L ${config.polyWidth} ${radius}
				Q ${config.polyWidth} 0, ${config.polyWidth - radius} 0
				L ${config.tipOffset} 0
				L ${config.tipPointOffset} ${-config.tipHeight}
				L ${config.tipOffset / 2} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else if(config.pointDown && !config.tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${config.polyHeight - radius}
				Q 0 ${config.polyHeight}, ${radius} ${config.polyHeight}
				L ${config.tipOffset / 2} ${config.polyHeight}
				L ${config.tipPointOffset} ${config.tipHeight + config.polyHeight}
				L ${config.tipOffset} ${config.polyHeight}
				L ${config.polyWidth - radius} ${config.polyHeight}
				Q ${config.polyWidth} ${config.polyHeight}, ${config.polyWidth} ${config.polyHeight - radius}
				L ${config.polyWidth} ${radius}
				Q ${config.polyWidth} 0, ${config.polyWidth - radius} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else if(!config.pointDown && config.tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${config.polyHeight - radius}
				Q 0 ${config.polyHeight}, ${radius} ${config.polyHeight}
				L ${config.polyWidth - radius} ${config.polyHeight}
				Q ${config.polyWidth} ${config.polyHeight}, ${config.polyWidth} ${config.polyHeight - radius}
				L ${config.polyWidth} ${radius}
				Q ${config.polyWidth} 0, ${config.polyWidth - radius} 0
				L ${config.polyWidth - config.tipOffset / 2} 0
				L ${config.polyWidth - config.tipPointOffset} ${-config.tipHeight}
				L ${config.polyWidth - config.tipOffset} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else { // pointDown && tipOnRight
			return oneLine`
				M 0 ${radius}
				L 0 ${config.polyHeight - radius}
				Q 0 ${config.polyHeight}, ${radius} ${config.polyHeight}
				L ${config.polyWidth - config.tipOffset} ${config.polyHeight}
				L ${config.polyWidth - config.tipPointOffset} ${config.tipHeight + config.polyHeight}
				L ${config.polyWidth - config.tipOffset / 2} ${config.polyHeight}
				L ${config.polyWidth - radius} ${config.polyHeight}
				Q ${config.polyWidth} ${config.polyHeight}, ${config.polyWidth} ${config.polyHeight - radius}
				L ${config.polyWidth} ${radius}
				Q ${config.polyWidth} 0, ${config.polyWidth - radius} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		}
	},
};

const SQUARE_BUBBLE: ITooltipBubble = {
	outline(config: ITooltipBubbleConfig): string {
		if(!config.pointDown && !config.tipOnRight) {
			return oneLine`
				M 0 0
				L 0 ${config.polyHeight}
				L ${config.polyWidth} ${config.polyHeight}
				L ${config.polyWidth} 0
				L ${config.tipOffset} 0
				L ${config.tipPointOffset} ${-config.tipHeight}
				L ${config.tipOffset / 2} 0
				L 0 0`;
		} else if(config.pointDown && !config.tipOnRight) {
			return oneLine`
				M 0 0
				L 0 ${config.polyHeight}
				L ${config.tipOffset / 2} ${config.polyHeight}
				L ${config.tipPointOffset} ${config.tipHeight + config.polyHeight}
				L ${config.tipOffset} ${config.polyHeight}
				L ${config.polyWidth} ${config.polyHeight}
				L ${config.polyWidth} 0
				L 0 0`;
		} else if(!config.pointDown && config.tipOnRight) {
			return oneLine`
				M 0 0
				L 0 ${config.polyHeight}
				L ${config.polyWidth} ${config.polyHeight}
				L ${config.polyWidth} 0
				L ${config.polyWidth - config.tipOffset / 2} 0
				L ${config.polyWidth - config.tipPointOffset} ${-config.tipHeight}
				L ${config.polyWidth - config.tipOffset} 0
				L 0 0`;
		} else { // pointDown && tipOnRight
			return oneLine`
				M 0 0
				L 0 ${config.polyHeight}
				L ${config.polyWidth - config.tipOffset} ${config.polyHeight}
				L ${config.polyWidth - config.tipPointOffset} ${config.tipHeight + config.polyHeight}
				L ${config.polyWidth - config.tipOffset / 2} ${config.polyHeight}
				L ${config.polyWidth} ${config.polyHeight}
				L ${config.polyWidth} 0
				L 0 0`;
		}
	},
};
