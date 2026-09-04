import { readFileSync } from "fs"; const data = JSON.parse(readFileSync("kits.json", "utf-8")); console.log(JSON.stringify(data.kits[0].schedule, null, 2));
