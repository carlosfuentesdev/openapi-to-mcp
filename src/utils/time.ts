/**
 * Utilidades de tiempo.
 *
 * Todo el código que necesite "ahora" debe pedirlo por inyección (`Clock`) en
 * lugar de llamar a `Date.now()` directamente: así los tests controlan el paso
 * del tiempo sin recurrir a temporizadores falsos.
 */

/** Fuente de tiempo inyectable. Devuelve milisegundos desde la época Unix. */
export interface Clock {
  now(): number;
}

/** Reloj real del sistema. Es el valor por defecto en producción. */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/**
 * Reloj controlable para tests: avanza sólo cuando se lo pides.
 *
 * @param startMs Instante inicial en milisegundos (por defecto 0).
 */
export function createTestClock(startMs = 0): Clock & { advance(ms: number): void } {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Convierte segundos a milisegundos. */
export const seconds = (n: number): number => n * 1000;

/** Convierte minutos a milisegundos. */
export const minutes = (n: number): number => n * 60_000;

/** Convierte horas a milisegundos. */
export const hours = (n: number): number => n * 3_600_000;
