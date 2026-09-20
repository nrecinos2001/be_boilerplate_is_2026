/** Payload que viaja dentro del JWT de acceso. */
export interface AccessTokenPayload {
  /** ID del usuario (claim estándar `sub`). */
  sub: string;
  username: string;
}

/** Par de tokens devuelto por login y refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Vigencia del access token, en segundos. */
  expiresIn: number;
}
