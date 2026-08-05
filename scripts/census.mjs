// Prints the behaviour census (issue #23):
//
//   npm run census
//
// Loads the real line definition through Vite's SSR module graph (so the
// extensionless src/ imports resolve exactly as they do for the app and the
// test suite) rather than duplicating any grouping logic here.
import { createServer } from "vite";

async function main() {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { line } = await server.ssrLoadModule("/src/line/lineData.js");
    const { validateLine } = await server.ssrLoadModule("/src/line/validateLine.js");
    const { computeBehaviorCensus, formatCensusReport } = await server.ssrLoadModule(
      "/src/line/behaviorCensus.js"
    );

    const { ok, errors } = validateLine(line);
    if (!ok) {
      console.error("line definition failed validation:\n" + errors.join("\n"));
      process.exitCode = 1;
      return;
    }

    console.log(formatCensusReport(computeBehaviorCensus(line)));
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
