// Shared across the mock and Supabase data implementations. The error class in
// particular MUST be shared so `e instanceof InsufficientBalanceError` works no
// matter which backend threw it.

/** Thrown by bookSession when the wallet can't cover the price. Screens catch
 *  this to open the top-up sheet pre-sized to the shortfall. */
/** Thrown by bookSession when the club asks everyone who books for an emergency contact and
 *  this person has none on file (migration 94, section 21). The session screen asks for one. */
export class EmergencyContactNeededError extends Error {
  constructor() {
    super('The club asks everyone who books for an emergency contact. Add one, then book.');
    this.name = 'EmergencyContactNeededError';
  }
}

export class InsufficientBalanceError extends Error {
  shortfallPence: number;
  constructor(shortfallPence: number) {
    super('Not enough balance to book this session.');
    this.name = 'InsufficientBalanceError';
    this.shortfallPence = shortfallPence;
  }
}
