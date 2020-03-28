# A tooltip library for D3

Add tooltips to your [D3](https://d3js.org/) charts. Implemented using [TypeScript](https://www.typescriptlang.org/).

## Getting Started


### Installation

```
npm install --save @phbalance/d3-tooltip
npm install --save color # peer dependency of a library
```

### Use

```
import { ITooltipConfig, Tooltip } from "@phbalance/d3-tooltip";

...

// Setup your d3 selection to have the data.tooltip property. It should be sufficient
// to have your datum to contain the tooltip property and then make sure you're doing
// a join. Something like this:
const svg = create("svg");
const selection = svg
    .selectAll("rect")
    .data(yourData);

const tooltipConfig: ITooltipConfig<IFlexibleBarChartDatum> = {
    rounded: true,
    bubbleWidth: bubbleWidth,
    bubbleHeight: -1,
    bubbleStroke: "red",
    bubbleStrokeWidth: bubbleWidth / 150,
    bubbleTip: {tipOffset: (3 / 4 * bubbleWidth / 9), h: 10, edgeOffset: bubbleWidth / 9},
    chartWidth: width,
    chartHeight: width,
    backgroundColour: "#F8F8F8",
    backgroundOpacity: 0.9,
    getData: (d: IFlexibleBarChartDatum) => d.tooltip,
};

const tooltip = new Tooltip<IFlexibleBarChartDatum>(svg, tooltipConfig);
const tooltipMouseover = tooltip.mouseoverHandler();
const tooltipMouseout = tooltip.mouseoutHandler();
const tooltipMousemove = tooltip.mousemoveHandler();

// Bind it to the d3 selection(s) that you want to show tooltips.
selection
    .enter()
        .on("mouseover", tooltipMouseover)
        .on("mouseout",  tooltipMouseout)
        .on("mousemove", tooltipMousemove);
```

### API

When creating a new Tooltip you pass in the svg that needs the tooltips. Inside this svg, the Tooltip will create a `g` element with a class of `tooltip-group`. Creating Tooltip (i.e. `new Tooltip(svg, ...)`) more than once is fine with the same svg as it will reuse an already existing `g.tooltip-group`.

The generated tooltip object contains 3 event handlers. You will want to bind at least the mouseover and mouseout handlers, but if you don't want your tooltip to follow the mouse around inside the selection, you don't need to bind it. If you don't being the mousemove, the tooltip will be pointing to the spot you entered the selection.

When an event handler is called, the getData function that was passed into the `tooltipConfig` is called to find the tooltip HTML.

### Reporting Issues

You can report [bugs here](https://github.com/phBalance/d3-tooltip/issues). Feel free to make suggestions as well.