import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateCode() {
  let value = "";
  for (let i = 0; i < 10; i++) value += ALPHABET[randomInt(ALPHABET.length)];
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}
