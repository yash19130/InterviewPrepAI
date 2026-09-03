import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildMockKit } from "../src/lib/pipeline/mock";
import {
  BatchInputSchema,
  BatchOutputSchema,
  type BatchKitResult,
} from "../src/lib/schemas";

type CliArgs = {
  input?: string;
  output?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input || !args.output) {
    throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  }

  const rawInput = await readFile(args.input, "utf8");
  const cases = BatchInputSchema.parse(JSON.parse(rawInput));

  const kits: BatchKitResult[] = cases.map((testCase) => {
    try {
      return {
        id: testCase.id,
        status: "ok",
        kit: buildMockKit({
          jd: testCase.jd,
          company_url: testCase.company_url,
          days: testCase.days,
        }),
        error: null,
      };
    } catch (error) {
      return {
        id: testCase.id,
        status: "failed",
        kit: null,
        error: {
          code: "KIT_GENERATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown generation failure.",
        },
      };
    }
  });

  const output = BatchOutputSchema.parse({
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits,
  });

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`);
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      parsed.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      parsed.output = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
