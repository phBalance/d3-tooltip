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

const tooltipOpacity = 0.9;
const tooltipBackground = "#F8F8F8";

const tooltip = new Tooltip(svg, width / 3, -1, width, width, tooltipBackground, tooltipOpacity);
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

The generated tooltip object contains 3 event handlers. You will want to bind at least the mouseover and mouseout handlers, but if you don't want your tooltip to follow the mouse around inside the selection, you don't need to bind it.

When an event handler is called, it checks the d.data.tooltip passed in via d3. It then interprets the tooltip as HTML.

### Reporting Issues

You can report [bugs here](https://github.com/phBalance/d3-tooltip/issues). Feel free to make suggestions as well.