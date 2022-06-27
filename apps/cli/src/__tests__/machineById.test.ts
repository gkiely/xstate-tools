import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("getMachineById", () => {
  const examplesPath = path.resolve(__dirname, "__machineIds__");
  const examplesFiles = fs.readdirSync(examplesPath);

  // console.log(examplesFiles);

  // minimatch
  //   .match(examplesFiles, "*.typegen.ts")
  //   .map((file) => fs.unlinkSync(path.join(examplesPath, file)));

  execSync("yarn build", {
    cwd: __dirname,
    stdio: "ignore",
  });

  execSync('node ../../bin/bin.js getMachines "./__machineIds__/*.ts"', {
    cwd: __dirname,
  });

  it("Should pass tsc", async () => {
    try {
      execSync(`tsc`, {
        cwd: examplesPath,
      });
    } catch (e: any) {
      throw new Error(e.stdout.toString());
    }
  });
});
