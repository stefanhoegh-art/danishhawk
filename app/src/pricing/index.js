/* Pieces whose price is a formula rather than a list of option deltas.
 *
 * Each model exposes price(selection) and returns øre. The modules themselves
 * live in the website's assets folder, because the browser quotes from exactly
 * the same file — the page and the checkout must never disagree about money.
 */
import * as tandhjulet from '../../../assets/tandhjulet-pricing.js';

const kr = (n) => Math.round(n * 100);   // the rest of the app counts in øre

export const PRICING_MODELS = {
  tandhjulet: {
    price(selection) {
      return kr(tandhjulet.priceDKK({
        diameter:  selection.diameter,
        material:  selection.material,
        treatment: selection.treatment,
        bearing:   selection.bearing,
        // 'same' is the menu's way of saying "follows the tabletop"
        boardFinish: selection.boardFinish === 'same' ? '' : selection.boardFinish,
      }));
    },
    normalise: tandhjulet.normalise,
  },
};
