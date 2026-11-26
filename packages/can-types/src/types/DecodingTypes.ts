/**
 * Minimal interfaces for decoded CAN message/signal identity.
 *
 * Full class implementations live in @csselectronics/can-decode (CanTypes.ts).
 * Pipeline services (FilterSelectionService, FilterTypes) reference only
 * these interfaces so that @csselectronics/can-pipeline never imports from
 * @csselectronics/can-decode, keeping the dependency direction strictly one-way.
 */

export interface ICanSignal {
  readonly name: string;
  readonly unit: string;
  /** DBC `CM_ SG_` description, capped at parse time. Display-only; never read on the decode path. */
  readonly comment?: string;
  /**
   * Value-to-text mappings from DBC `VAL_` entries (enumerations), keyed by
   * the (integer) physical value. Present iff the signal declared a value
   * table. The concrete `CanSignal` in @csselectronics/can-decode supplies a
   * `Map<number,string>`, which satisfies this read-only view. Display layers
   * use it to render e.g. `3: Not available` instead of a bare number.
   */
  readonly valueTable?: ReadonlyMap<number, string>;
}

export interface ICanMessage {
  readonly name: string;
  readonly isExtended: boolean;
  readonly isMultiplexed: boolean;
  /**
   * True if this message has variable-length payload (e.g. J1939 DM1).
   * Frames whose data is shorter than a signal's `requiredBytes` will omit
   * that signal entirely from the decoded keys/values rather than NaN-fill.
   */
  readonly isVariableLength: boolean;
  /** DBC per-message attributes (`BA_ "Name" BO_ <id> "Value";`); empty when none. */
  readonly attributes?: ReadonlyMap<string, string | number>;
  /** DBC `CM_ BO_` description, capped at parse time. Display-only; never read on the decode path. */
  readonly comment?: string;
}
