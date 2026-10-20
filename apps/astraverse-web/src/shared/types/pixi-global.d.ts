/** The Cubism adapter's declarations target Pixi's global namespace.
 * Re-export the installed Pixi types without creating a runtime global. */
export * from "pixi.js";
export as namespace PIXI;
