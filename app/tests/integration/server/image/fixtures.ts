import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const EXAMPLE_IMAGES = [
  "laptop-1.png",
  "laptop-2.webp",
  "phone-1.jpg",
  "phone-2.jpeg",
  "phone-3.jpeg",
] as const;

export type ExampleImage = (typeof EXAMPLE_IMAGES)[number];

const imagesDir = new URL("../../../../../assets/example-images/", import.meta.url);

/** Reads a real sample photo from `assets/example-images/` (never generated, never modified). */
export async function readExampleImage(name: ExampleImage): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fileURLToPath(new URL(name, imagesDir))));
}
