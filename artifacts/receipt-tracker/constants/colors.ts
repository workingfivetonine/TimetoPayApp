const colors = {
  light: {
    text: "#17242b",
    tint: "#04576a",

    background: "#f7f6f9",
    foreground: "#17242b",

    card: "#ffffff",
    cardForeground: "#17242b",

    primary: "#04576a",
    primaryForeground: "#ffffff",

    secondary: "#ececef",
    secondaryForeground: "#17242b",

    muted: "#ececef",
    mutedForeground: "#4c6b66",

    accent: "#e3ede9",
    accentForeground: "#04576a",

    destructive: "#c13e77",
    destructiveForeground: "#ffffff",

    border: "#e6e4ec",
    input: "#e6e4ec",

    // Spend analytics colors
    spendHigh: "#f7dbe6",
    spendHighText: "#c13e77",
    spendLow: "#e3ede9",
    spendLowText: "#1e4d40",
    spendNormal: "#f7f6f9",
    spendNormalText: "#4c6b66",

    // Price comparison
    priceGood: "#1e4d40",
    priceBad: "#c13e77",
    priceNeutral: "#4c6b66",

    // Warning / caution
    warning: "#935a00",
    warningBackground: "#fdecd0",

    // Categorical chart series, in FIXED slot order — assigned by position and
    // never cycled, so a series keeps its colour when the set is filtered.
    // Validated against the light card surface (#ffffff): lightness band,
    // chroma floor, colour-vision separation and normal-vision separation all
    // pass. Slots 3/4/5 fall under 3:1 contrast, which is why every chart using
    // these MUST carry a legend naming each series — colour never carries
    // identity on its own. Past 6 series, fold the rest into one "Other" line
    // rather than inventing a 7th hue.
    chartSeries: [
      "#2a78d6", // blue
      "#eb6834", // orange
      "#1baf7a", // aqua
      "#eda100", // yellow
      "#e87ba4", // magenta
      "#008300", // green
    ],
  },
  dark: {
    text: "#eef1f5",
    tint: "#4fb3c9",

    background: "#1c1b30",
    foreground: "#eef1f5",

    card: "#272643",
    cardForeground: "#eef1f5",

    primary: "#4fb3c9",
    primaryForeground: "#0a2830",

    secondary: "#221f3d",
    secondaryForeground: "#eef1f5",

    muted: "#221f3d",
    mutedForeground: "#9c9ab8",

    accent: "#24463c",
    accentForeground: "#bbd4ce",

    destructive: "#e8709e",
    destructiveForeground: "#0a2830",

    border: "#363458",
    input: "#363458",

    // Spend analytics colors
    spendHigh: "#3d1f30",
    spendHighText: "#e8709e",
    spendLow: "#24463c",
    spendLowText: "#bbd4ce",
    spendNormal: "#272643",
    spendNormalText: "#9c9ab8",

    // Price comparison
    priceGood: "#bbd4ce",
    priceBad: "#e8709e",
    priceNeutral: "#9c9ab8",

    // Warning / caution
    warning: "#f5a623",
    warningBackground: "#332204",

    // Same six hues re-stepped for the dark card surface (#272643) — a selected
    // dark palette, not an automatic flip of the light one. All six clear 3:1
    // here. The green is lighter than its light-mode twin specifically to clear
    // contrast against this surface.
    chartSeries: [
      "#3987e5", // blue
      "#d95926", // orange
      "#199e70", // aqua
      "#c98500", // yellow
      "#d55181", // magenta
      "#12a012", // green
    ],
  },
  radius: 12,
};

export default colors;
