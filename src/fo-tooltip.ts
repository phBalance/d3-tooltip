import { chooseHighestContrastColour } from "@phbalance/contrast-colour";
import { oneLine } from "common-tags";
import { mouse } from "d3-selection";

export type ITooltipConfigDataFn<DatumType> = (d: DatumType) => string | undefined;

export interface ITooltipConfig<DatumType> {
	bubbleWidth: number;
	bubbleHeight: number;
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
	tipWidth: number;
	tipHeight: number;
	pointDown: boolean;
	tipOnRight: boolean;
}

// Blink (Chrome) has an issue with foreignObjects and screen zooming (or high density screens). See:
// https://bugs.chromium.org/p/chromium/issues/detail?id=738022&q=chrome%20svg%20devicePixelRatio&colspec=ID%20Pri%20M%20Stars%20ReleaseBlock%20Component%20Status%20Owner%20Summary%20OS%20Modified
// To compensate for this, we need to factor back to CSS pixels if this behaviour is present.

// FIXME: Unstyle divs?
// FIXME: floating behing so they don't change the size of the screen?

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

	// console.error(`fo: ${JSON.stringify(foDivBound.height)} div: ${JSON.stringify(divBound.height)} ratio: ${window.devicePixelRatio} multiple: ${zoomMultiple}`);

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
// NOTE: You must wrap your html in a <div>, since it's assumed there is one, so that calculations of size can be done. Also, it gives a good anchor for applying
//       padding, and other styling, can be applied via CSS.
export class Tooltip<DatumType> {

	private static getBoundingHeight(content: SVGGraphicsElement, rootNode: SVGSVGElement): number {
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

		return (svgPt2.y - svgPt1.y) / zoomFactor;
	}

	// Generate a tooltip bubble from a polygon. This generates the points required for the polygon
	// based on where the bubble should be (i.e. tip pointing up/down and tip on left or right side of the bubble.)
	private static genBubblePolyPoints(config: ITooltipBubbleConfig): string {
		if(!config.pointDown && !config.tipOnRight) {
			return `0,0 0,${config.polyHeight} ${config.polyWidth},${config.polyHeight} ${config.polyWidth},0 ${config.tipOffset},0 ${config.tipWidth},${-config.tipHeight} ${config.tipOffset / 2},0`;
		} else if(config.pointDown && !config.tipOnRight) {
			return `0,0 0,${config.polyHeight} ${config.tipOffset / 2},${config.polyHeight} ${config.tipWidth},${config.tipHeight + config.polyHeight} ${config.tipOffset},${config.polyHeight} ${config.polyWidth},${config.polyHeight} ${config.polyWidth},0`;
		} else if(!config.pointDown && config.tipOnRight) {
			return `0,0 0,${config.polyHeight} ${config.polyWidth},${config.polyHeight} ${config.polyWidth},0 ${config.polyWidth - config.tipOffset / 2},0 ${config.polyWidth - config.tipWidth},${-config.tipHeight} ${config.polyWidth - config.tipOffset},0`;
		} else {
			return `0,0 0,${config.polyHeight} ${config.polyWidth - config.tipOffset},${config.polyHeight} ${config.polyWidth - config.tipWidth},${config.tipHeight + config.polyHeight} ${config.polyWidth - config.tipOffset / 2},${config.polyHeight} ${config.polyWidth},${config.polyHeight} ${config.polyWidth},0`;
		}
	}

	private static genBubblePath(config: ITooltipBubbleConfig): string {
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
				L ${config.tipWidth} ${-config.tipHeight}
				L ${config.tipOffset / 2} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else if(config.pointDown && !config.tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${config.polyHeight - radius}
				Q 0 ${config.polyHeight}, ${radius} ${config.polyHeight}
				L ${config.tipOffset / 2} ${config.polyHeight}
				L ${config.tipWidth} ${config.tipHeight + config.polyHeight}
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
				L ${config.polyWidth - config.tipWidth} ${-config.tipHeight}
				L ${config.polyWidth - config.tipOffset} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else { // pointDown && tipOnRight
			return oneLine`
				M 0 ${radius}
				L 0 ${config.polyHeight - radius}
				Q 0 ${config.polyHeight}, ${radius} ${config.polyHeight}
				L ${config.polyWidth - config.tipOffset} ${config.polyHeight}
				L ${config.polyWidth - config.tipWidth} ${config.tipHeight + config.polyHeight}
				L ${config.polyWidth - config.tipOffset / 2} ${config.polyHeight}
				L ${config.polyWidth - radius} ${config.polyHeight}
				Q ${config.polyWidth} ${config.polyHeight}, ${config.polyWidth} ${config.polyHeight - radius}
				L ${config.polyWidth} ${radius}
				Q ${config.polyWidth} 0, ${config.polyWidth - radius} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		}
	}

	// FIXME: Should be configurable
	private tipOffset = 50;
	private tip = {w: (3 / 4 * 50), h: 10};

	private readonly tooltipArea: any; // FIXME: Tooltip typing
	private readonly rootSelection: any; // FIXME: Tooltip typing
	private readonly bubbleWidth: number;
	private readonly bubbleHeight: number;
	private readonly chartWidth: number;
	private readonly chartHeight: number;
	private readonly bubbleOpacity: number;
	private readonly bubbleBackground: string;
	private readonly bubbleStroke: string;
	private readonly roundedBubble: boolean;
	private readonly getData: ITooltipConfigDataFn<DatumType>;
	private calculatedHeight: number;

	// If bubbleHeight < 0 then go with a dynamically calculated bubble height.
	constructor(rootSelection: any, config: ITooltipConfig<DatumType>) {
		this.tooltipArea = rootSelection
			.append("g")
				.attr("class", "tooltip-group");

		this.rootSelection = rootSelection;
		this.bubbleWidth = config.bubbleWidth;
		this.bubbleHeight = config.bubbleHeight;
		this.chartWidth = config.chartWidth;
		this.chartHeight = config.chartHeight;
		this.bubbleBackground = config.backgroundColour;
		this.bubbleOpacity = config.backgroundOpacity;
		this.bubbleStroke = chooseHighestContrastColour(config.backgroundColour, config.backgroundOpacity);
		this.roundedBubble = true;
		this.getData = config.getData;

		this.calculatedHeight = 0;
	}

	public mouseoverHandler() {
		const objThis = this;

		// NOTE: This function will be called with different "this" - it is not the object this
		return function(d: DatumType) {
			// console.log(`d3Event: ${d3.event}`);
			const tooltip = objThis.getData(d);
			if(tooltip) {
				let [x, y] = mouse(objThis.rootSelection.node() as any);
				// console.log(`mouseover event at ${x}, ${y}`);

				const testContent = objThis.tooltipArea
					.append("foreignObject")
						.attr("class", "svg-tooltip-content")
						.attr("pointer-events", "none")
						.attr("width", objThis.bubbleWidth)
						.attr("height", 1) // Firefox, at this point, requires height >= 1 to calculate children correctly.
						.html(tooltip);

				objThis.calculatedHeight = objThis.bubbleHeight >= 0
					? objThis.bubbleHeight
					: Tooltip.getBoundingHeight(testContent.select("div").node() as SVGGraphicsElement, objThis.rootSelection.node());

				// Position the tooltip to keep inside the chart
				let invertVert = false;
				let invertHoriz = false;
				if(x + objThis.bubbleWidth > objThis.chartWidth) {
					x = x - objThis.bubbleWidth;
					invertHoriz = true;
				}

				if(y + objThis.calculatedHeight + objThis.tip.h > objThis.chartHeight) {
					y = y - objThis.calculatedHeight;
					invertVert = true;
				}

				testContent
					.attr("x", x + (invertHoriz ? objThis.tip.w : -objThis.tip.w))
					.attr("y", y + (invertVert ? -objThis.tip.h : +objThis.tip.h))
					.attr("height", objThis.calculatedHeight);

				if(objThis.roundedBubble) {
					objThis.tooltipArea
						.insert("path", "foreignObject")
							.attr("class", "svg-tooltip-outline")
							.attr("pointer-events", "none")
							.attr("transform", `translate(${(x + (invertHoriz ? objThis.tip.w : -objThis.tip.w))},${(y + (invertVert ? -objThis.tip.h : +objThis.tip.h))})`)
							.attr("d", Tooltip.genBubblePath(objThis.generateBubbleconfig(invertVert, invertHoriz)))
							.attr("fill", objThis.bubbleBackground)
							.attr("opacity", objThis.bubbleOpacity)
							.attr("stroke", objThis.bubbleStroke)
							.attr("stroke-width", objThis.bubbleWidth / 100);
				} else {
					objThis.tooltipArea
						.insert("polygon", "foreignObject")
							.attr("class", "svg-tooltip-outline")
							.attr("pointer-events", "none")
							.attr("transform", `translate(${(x + (invertHoriz ? objThis.tip.w : -objThis.tip.w))},${(y + (invertVert ? -objThis.tip.h : +objThis.tip.h))})`)
							.attr("width", objThis.bubbleWidth)
							.attr("height", objThis.calculatedHeight)
							.attr("points", Tooltip.genBubblePolyPoints(objThis.generateBubbleconfig(invertVert, invertHoriz)))
							.attr("fill", objThis.bubbleBackground)
							.attr("opacity", objThis.bubbleOpacity);
				}
			}
		};
	}

	public mousemoveHandler() {
		const objThis = this;

		// NOTE: This function will be called with different "this" - it is not the object this
		return function(d: DatumType) {
			const tooltip = objThis.getData(d);
			if(tooltip) {
				let [x, y] = mouse(objThis.rootSelection.node() as any);
				// console.log(`mousemove event at ${x}, ${y}`);

				const calculatedHeight = objThis.calculatedHeight;

				// Position the tooltip to keep inside the chart
				let invertVert = false;
				let invertHoriz = false;
				if(x + objThis.bubbleWidth > objThis.chartWidth) {
					x = x - objThis.bubbleWidth;
					invertHoriz = true;
				}

				if(y + calculatedHeight + objThis.tip.h > objThis.chartHeight) {
					y = y - calculatedHeight;
					invertVert = true;
				}

				if(objThis.roundedBubble) {
					objThis.tooltipArea
						.select("path")
						.attr("d", Tooltip.genBubblePath(objThis.generateBubbleconfig(invertVert, invertHoriz)))
						.attr("transform", `translate(${(x + (invertHoriz ? objThis.tip.w : -objThis.tip.w))},${(y + (invertVert ? -objThis.tip.h : objThis.tip.h))})`);
				} else {
					objThis.tooltipArea
						.select("polygon")
						.attr("points", Tooltip.genBubblePolyPoints(objThis.generateBubbleconfig(invertVert, invertHoriz)))
						.attr("transform", `translate(${(x + (invertHoriz ? objThis.tip.w : -objThis.tip.w))},${(y + (invertVert ? -objThis.tip.h : objThis.tip.h))})`);
				}

				objThis.tooltipArea
					.select("foreignObject")
					.attr("x", x + (invertHoriz ? objThis.tip.w : -objThis.tip.w))
					.attr("y", y + (invertVert ? -objThis.tip.h : objThis.tip.h));
			}
		};
	}

	public mouseoutHandler() {
		const objThis = this;

		// NOTE: This function will be called with different "this" which is not the object this
		return function(d: DatumType) {
			const tooltip = objThis.getData(d);
			if(tooltip) {
				const [x, y] = mouse(objThis.rootSelection.node() as any);
				// console.log(`mouseout event at ${x}, ${y}`);

				objThis.calculatedHeight = 0;

				objThis.tooltipArea
					.select("foreignObject")
						.remove();

				if(objThis.roundedBubble) {
					objThis.tooltipArea
					.select("path")
						.remove();
				} else {
					objThis.tooltipArea
					.select("polygon")
						.remove();
				}
			}
		};
	}

	private generateBubbleconfig(invertVert: boolean, invertHoriz: boolean): ITooltipBubbleConfig {
		return {
			pointDown: invertVert,
			polyHeight: this.calculatedHeight,
			polyWidth: this.bubbleWidth,
			tipHeight: this.tip.h,
			tipOffset: this.tipOffset,
			tipOnRight: invertHoriz,
			tipWidth: this.tip.w,
		};
	}
}
