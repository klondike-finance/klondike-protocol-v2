import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { resolve } from "path";
const REGISTRY = {
  path: "",
  data: {} as { [key: string]: any },
  timestamp: new Date().toISOString(),
  initialized: false,
};

export function initRegistry(hre: HardhatRuntimeEnvironment) {
  if (REGISTRY.initialized) {
    return;
  }
  const root = resolve(__dirname, "..", "registry", hre.network.name);
  REGISTRY.path = resolve(root, `${new Date().getTime()}.json`);
  try {
    mkdirSync(root, { recursive: true });
  } catch (e) {}

  const files = readdirSync(root).map((f) => resolve(root, f));
  if (!files || !files.length) {
    REGISTRY.initialized = true;
    return;
  }
  let max = 0;
  let maxTime = statSync(files[0]).ctime;
  for (let i = 1; i < files.length; i++) {
    const time = statSync(files[i]).ctime;
    if (time > maxTime) {
      maxTime = time;
      max = i;
    }
  }
  REGISTRY.data = JSON.parse(readFileSync(files[max]).toString());
  REGISTRY.initialized = true;
  console.log(REGISTRY);
}

export function updateRegistry(
  hre: HardhatRuntimeEnvironment,
  key: string,
  value: any
) {
  const root = resolve(
    __dirname,
    "..",
    "registry",
    hre.network.name,
    `${REGISTRY.timestamp}.json`
  );
  REGISTRY.data[key] = value;
  writeFileSync(root, JSON.stringify(REGISTRY.data, null, 2));
}
