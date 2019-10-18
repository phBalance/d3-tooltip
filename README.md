# A tooltip library for D3

Add tooltips to your [D3](https://d3js.org/) charts. Implemented using [TypeScript](https://www.typescriptlang.org/).

## Getting Started


### Installation

```
npm install --save @phbalance/d3-tooltip
```

### Use

```
import { Tooltip } from "@phbalance/d3-tooltip";

...

// Setup your d3 selection to have the data.tooltip property. It should be sufficient
// to have your datum to contain the tooltip property and then make sure you're doing
// a join. Something like this:
const svg = create("svg");
const selection = svg
    .selectAll("rect")
    .data(yourData);

const tooltipConfig = {
    bubbleWidth: width / 3,
    bubbleHeight: -1, // Let tooltip dynamically figure out the height for you.
    chartWidth: width,
    chartHeight: width,
    backgroundColour: "#F8F8F8",
    backgroundOpacity: 0.9,
    getData: (d) => d.tooltip, // Assuming tooltip data is located at d.tooltip
};

const tooltip = new Tooltip<IFlexibleBarChartDatum>(svg, tooltipConfig);
const tooltipMouseover = tooltip.mouseoverHandler();
const tooltipMouseout = tooltip.mouseoutHandler();
const tooltipMousemove = tooltip.mousemoveHandler();


// Bind it to your d3 selection that you want to show tooltips.
selection
    .enter()
        .on("mouseover", tooltipMouseover)
        .on("mouseout", tooltipMouseout)
        .on("mousemove", tooltipMousemove);
```

### API

The generated tooltip object contains 3 event handlers. You will want to bind at least the mouseover and mouseout handlers, but if you don't want your tooltip to follow the mouse around inside the selection, you don't need to bind it. If you don't being the mousemove, the tooltip will be pointing to the spot you entered the selection.

When an event handler is called, the getData function that was passed into the `tooltipConfig` is called to find the tooltip HTML.

### Reporting Issues

You can report [bugs here](https://github.com/phBalance/d3-tooltip/issues). Feel free to make suggestions as well.