/* What a Tandhjulet costs.
 *
 * The page quotes a price in the browser and the server quotes it again before
 * anyone is charged. If those two ever disagree, a customer sees one number and
 * pays another — so they read the same file rather than each keeping a copy.
 *
 * Plain ES module, no dependencies: the site imports it over HTTP from
 * /assets/, the Node server imports it from disk.
 */

export const REF_DIA = 1855;          // the first table; every price is anchored here
export const MIN_DIA = 1855;
export const MAX_DIA = 2000;

export const MARKUP    = 1.5;         // on everything bought or consumed
export const WORK_DKK  = 10650;       // design, CNC, underframe, finish, assembly
export const MATERIAL  = { solid: 12000, veneer: 4000 };   // to produce, at REF_DIA
export const TREATMENT = { olie: 0, lak: 1000 };           // per top, at REF_DIA
export const BEARING   = { '401.5': 600, '601.5': 900 };   // to buy
export const THICKNESS = { solid: 26, veneer: 21 };        // mm
export const FINISHES  = ['natur', 'hvid', 'moerk', 'roeget'];

export const ROUNDING = 500;          // prices are quoted to the nearest 500 kr

/** Everything but the work scales with the area of the top. */
export function priceDKK({ diameter, material, treatment, bearing }) {
  const spec = normalise({ diameter, material, treatment, bearing });
  const areaRatio = Math.pow(spec.diameter / REF_DIA, 2);
  const parts = (MATERIAL[spec.material] + TREATMENT[spec.treatment]) * areaRatio
              + BEARING[spec.bearing];
  return Math.round((WORK_DKK + parts * MARKUP) / ROUNDING) * ROUNDING;
}

/**
 * Checks a configuration and returns it in canonical form. Throws on anything
 * it does not recognise, so a cart cannot carry a size or a finish that was
 * never offered.
 */
export function normalise({ diameter, material, treatment, bearing, finish, boardFinish }) {
  const d = Number(diameter);
  if (!Number.isFinite(d)) throw new Error('Diameter mangler');
  if (d < MIN_DIA || d > MAX_DIA) {
    throw new Error(`Diameter skal ligge mellem ${MIN_DIA} og ${MAX_DIA} mm`);
  }
  if (d % 5 !== 0) throw new Error('Diameter angives i hele 5 mm');

  const m = String(material);
  if (!(m in MATERIAL)) throw new Error(`Ukendt bordplade: ${material}`);
  const t = String(treatment);
  if (!(t in TREATMENT)) throw new Error(`Ukendt behandling: ${treatment}`);
  const b = String(bearing);
  if (!(b in BEARING)) throw new Error(`Ukendt leje: ${bearing}`);

  const spec = { diameter: d, material: m, treatment: t, bearing: b };
  if (finish !== undefined) {
    if (!FINISHES.includes(String(finish))) throw new Error(`Ukendt farve: ${finish}`);
    spec.finish = String(finish);
  }
  /* The turntable is finished separately, so it may carry its own colour. An
     empty value means it follows the tabletop; it costs the same either way,
     but it has to survive into the order so the right board gets built. */
  if (boardFinish !== undefined && boardFinish !== null && boardFinish !== '') {
    if (!FINISHES.includes(String(boardFinish))) {
      throw new Error(`Ukendt farve på drejeskiven: ${boardFinish}`);
    }
    spec.boardFinish = String(boardFinish);
  }
  return spec;
}
