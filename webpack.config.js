const path = require("path");

module.exports = {
  entry: {
    "fo-tooltip": "./src/fo-tooltip.ts"
  },
  output: {
    filename: "[name].js",
    library: "d3-tooltip",
    libraryTarget: "umd",
    path: path.resolve(__dirname),
    globalObject: "this"
  },
  resolve: {
    extensions: [".js", ".ts", ".tsx"]
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader" }
    ]
  },
  plugins: [],
  devServer: {
    open: true
  },
  devtool: "source-map"
}