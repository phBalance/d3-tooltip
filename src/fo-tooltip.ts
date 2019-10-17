import { oneLine } from "common-tags";
import { mouse } from "d3-selection";
import { chooseHighestContrastColour } from "@phbalance/contrast-colour";

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

	console.error(`fo: ${JSON.stringify(foDivBound.height)} div: ${JSON.stringify(divBound.height)} ratio: ${window.devicePixelRatio} multiple: ${zoomMultiple}`);

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
export class Tooltip {

	public static getBoundingHeight(content: SVGGraphicsElement, rootNode: SVGSVGElement): number {
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
	private static genBubblePolyPoints(polyWidth: number, polyHeight: number, tipOffset: number, tipWidth: number, tipHeight: number, pointDown: boolean, tipOnRight: boolean): string {
		if(!pointDown && !tipOnRight) {
			return `0,0 0,${polyHeight} ${polyWidth},${polyHeight} ${polyWidth},0 ${tipOffset},0 ${tipWidth},${-tipHeight} ${tipOffset / 2},0`;
		} else if(pointDown && !tipOnRight) {
			return `0,0 0,${polyHeight} ${tipOffset / 2},${polyHeight} ${tipWidth},${tipHeight + polyHeight} ${tipOffset},${polyHeight} ${polyWidth},${polyHeight} ${polyWidth},0`;
		} else if(!pointDown && tipOnRight) {
			return `0,0 0,${polyHeight} ${polyWidth},${polyHeight} ${polyWidth},0 ${polyWidth - tipOffset / 2},0 ${polyWidth - tipWidth},${-tipHeight} ${polyWidth - tipOffset},0`;
		} else {
			return `0,0 0,${polyHeight} ${polyWidth - tipOffset},${polyHeight} ${polyWidth - tipWidth},${tipHeight + polyHeight} ${polyWidth - tipOffset / 2},${polyHeight} ${polyWidth},${polyHeight} ${polyWidth},0`;
		}
	}

	private static genBubblePath(polyWidth: number, polyHeight: number, tipOffset: number, tipWidth: number, tipHeight: number, pointDown: boolean, tipOnRight: boolean): string {
		const radius = 10; // FIXME: modify on polyWidth and polyHeight

		if(!pointDown && !tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${polyHeight - radius}
				Q 0 ${polyHeight}, ${radius} ${polyHeight}
				L ${polyWidth - radius} ${polyHeight}
				Q ${polyWidth} ${polyHeight}, ${polyWidth} ${polyHeight - radius}
				L ${polyWidth} ${radius}
				Q ${polyWidth} 0, ${polyWidth - radius} 0
				L ${tipOffset} 0
				L ${tipWidth} ${-tipHeight}
				L ${tipOffset / 2} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else if(pointDown && !tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${polyHeight - radius}
				Q 0 ${polyHeight}, ${radius} ${polyHeight}
				L ${tipOffset / 2} ${polyHeight}
				L ${tipWidth} ${tipHeight + polyHeight}
				L ${tipOffset} ${polyHeight}
				L ${polyWidth - radius} ${polyHeight}
				Q ${polyWidth} ${polyHeight}, ${polyWidth} ${polyHeight - radius}
				L ${polyWidth} ${radius}
				Q ${polyWidth} 0, ${polyWidth - radius} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else if(!pointDown && tipOnRight) {
			return oneLine`
				M 0 ${radius}
				L 0 ${polyHeight - radius}
				Q 0 ${polyHeight}, ${radius} ${polyHeight}
				L ${polyWidth - radius} ${polyHeight}
				Q ${polyWidth} ${polyHeight}, ${polyWidth} ${polyHeight - radius}
				L ${polyWidth} ${radius}
				Q ${polyWidth} 0, ${polyWidth - radius} 0
				L ${polyWidth - tipOffset / 2} 0
				L ${polyWidth - tipWidth} ${-tipHeight}
				L ${polyWidth - tipOffset} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		} else { // pointDown && tipOnRight
			return oneLine`
				M 0 ${radius}
				L 0 ${polyHeight - radius}
				Q 0 ${polyHeight}, ${radius} ${polyHeight}
				L ${polyWidth - tipOffset} ${polyHeight}
				L ${polyWidth - tipWidth} ${tipHeight + polyHeight}
				L ${polyWidth - tipOffset / 2} ${polyHeight}
				L ${polyWidth - radius} ${polyHeight}
				Q ${polyWidth} ${polyHeight}, ${polyWidth} ${polyHeight - radius}
				L ${polyWidth} ${radius}
				Q ${polyWidth} 0, ${polyWidth - radius} 0
				L ${radius} 0
				Q 0 0, 0 ${radius}`;
		}
	}

	// FIXME: Should be configurable
	private tipOffset = 50;
	private tip = {w: (3 / 4 * 50), h: 10};

	private readonly tooltipArea;
	private readonly rootSelection;
	private readonly bubbleWidth;  // FIXME: dynamic / CSS based?
	private readonly bubbleHeight;
	private readonly chartWidth;
	private readonly chartHeight;
	private readonly bubbleOpacity;
	private readonly bubbleBackground;
	private readonly bubbleStroke;
	private readonly roundedBubble;
	private calculatedHeight: number;

	// If bubbleHeight < 0 then go with a dynamically calculated bubble height.
	constructor(rootSelection, bubbleWidth: number, bubbleHeight: number, chartWidth: number, chartHeight: number, backgroundColour, backgroundOpacity) {
		this.rootSelection = rootSelection;
		this.bubbleWidth = bubbleWidth;
		this.bubbleHeight = bubbleHeight;
		this.chartWidth = chartWidth;
		this.chartHeight = chartHeight;
		this.bubbleBackground = backgroundColour;
		this.bubbleOpacity = backgroundOpacity;
		this.bubbleStroke = chooseHighestContrastColour(backgroundColour, backgroundOpacity);
		this.roundedBubble = true;
		this.calculatedHeight = 0;

		this.tooltipArea = rootSelection
			.append("g")
				.attr("class", "tooltip-group");
	}

	public mouseoverHandler() {
		const This = this;

		// NOTE: This function will be called with different "this" - it is not the object this
		return function(d) {
			if(d && d.data && d.data.tooltip) {
				let [x, y] = mouse(This.rootSelection.node() as any);
				// console.log(`mouseover event at ${x}, ${y}`);

				const testContent = This.tooltipArea
					.append("foreignObject")
						.attr("class", "svg-tooltip-content")
						.attr("pointer-events", "none")
						.attr("width", This.bubbleWidth)
						.attr("height", 1) // Firefox, at this point, requires height >= 1 to calculate children correctly.
						.html(d.data.tooltip);

				const calculatedHeight = This.bubbleHeight >= 0 ? This.bubbleHeight : Tooltip.getBoundingHeight(testContent.select("div").node(), This.rootSelection.node());
				This.calculatedHeight = calculatedHeight;

				// Position the tooltip to keep inside the chart
				let invertVert = false;
				let invertHoriz = false;
				if(x + This.bubbleWidth > This.chartWidth) {
					x = x - This.bubbleWidth;
					invertHoriz = true;
				}

				if(y + calculatedHeight + This.tip.h > This.chartHeight) {
					y = y - calculatedHeight;
					invertVert = true;
				}

				testContent
					.attr("x", x + (invertHoriz ? This.tip.w : -This.tip.w))
					.attr("y", y + (invertVert ? -This.tip.h : +This.tip.h))
					.attr("height", calculatedHeight);

				if(This.roundedBubble) {
					This.tooltipArea
						.insert("path", "foreignObject")
							.attr("class", "svg-tooltip-outline")
							.attr("pointer-events", "none")
							.attr("transform", `translate(${(x + (invertHoriz ? This.tip.w : -This.tip.w))},${(y + (invertVert ? -This.tip.h : +This.tip.h))})`)
							.attr("d", Tooltip.genBubblePath(This.bubbleWidth, calculatedHeight, This.tipOffset, This.tip.w, This.tip.h, invertVert, invertHoriz))
							.attr("fill", This.bubbleBackground)
							.attr("opacity", This.bubbleOpacity)
							.attr("stroke", This.bubbleStroke)
							.attr("stroke-width", This.bubbleWidth / 100);
				} else {
					This.tooltipArea
						.insert("polygon", "foreignObject")
							.attr("class", "svg-tooltip-outline")
							.attr("pointer-events", "none")
							.attr("transform", `translate(${(x + (invertHoriz ? This.tip.w : -This.tip.w))},${(y + (invertVert ? -This.tip.h : +This.tip.h))})`)
							.attr("width", This.bubbleWidth)
							.attr("height", calculatedHeight)
							.attr("points", Tooltip.genBubblePolyPoints(This.bubbleWidth, calculatedHeight, This.tipOffset, This.tip.w, This.tip.h, invertVert, invertHoriz))
							.attr("fill", This.bubbleBackground)
							.attr("opacity", This.bubbleOpacity);
				}
			}
		};
	}

	public mousemoveHandler() {
		const This = this;

		// NOTE: This function will be called with different "this" - it is not the object this
		return function(d) {
			if(d && d.data && d.data.tooltip) {
				let [x, y] = mouse(This.rootSelection.node() as any);
				// console.log(`mousemove event at ${x}, ${y}`);

				const calculatedHeight = This.calculatedHeight;

				// Position the tooltip to keep inside the chart
				let invertVert = false;
				let invertHoriz = false;
				if(x + This.bubbleWidth > This.chartWidth) {
					x = x - This.bubbleWidth;
					invertHoriz = true;
				}

				if(y + calculatedHeight + This.tip.h > This.chartHeight) {
					y = y - calculatedHeight;
					invertVert = true;
				}

				if(This.roundedBubble) {
					This.tooltipArea
						.select("path")
						.attr("d", Tooltip.genBubblePath(This.bubbleWidth, calculatedHeight, This.tipOffset, This.tip.w, This.tip.h, invertVert, invertHoriz))
						.attr("transform", `translate(${(x + (invertHoriz ? This.tip.w : -This.tip.w))},${(y + (invertVert ? -This.tip.h : This.tip.h))})`);
				} else {
					This.tooltipArea
						.select("polygon")
						.attr("points", Tooltip.genBubblePolyPoints(This.bubbleWidth, calculatedHeight, This.tipOffset, This.tip.w, This.tip.h, invertVert, invertHoriz))
						.attr("transform", `translate(${(x + (invertHoriz ? This.tip.w : -This.tip.w))},${(y + (invertVert ? -This.tip.h : This.tip.h))})`);
				}

				This.tooltipArea
					.select("foreignObject")
					.attr("x", x + (invertHoriz ? This.tip.w : -This.tip.w))
					.attr("y", y + (invertVert ? -This.tip.h : This.tip.h));
			}
		};
	}

	public mouseoutHandler() {
		const This = this;

		// NOTE: This function will be called with different "this" which is not the object this
		return function(d) {
			if(d && d.data && d.data.tooltip) {
				const [x, y] = mouse(This.rootSelection.node() as any);
				// console.log(`mouseout event at ${x}, ${y}`);

				This.calculatedHeight = 0;

				This.tooltipArea
					.select("foreignObject")
						.remove();

				if(This.roundedBubble) {
					This.tooltipArea
					.select("path")
						.remove();
				} else {
					This.tooltipArea
					.select("polygon")
						.remove();
				}
			}
		};
	}
}
