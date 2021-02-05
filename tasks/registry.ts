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
  index: {} as { [key: string]: any },
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
  for (const name in REGISTRY.data) {
    REGISTRY.index[REGISTRY.data[name].address] = name;
  }
  REGISTRY.initialized = true;
}

export function getRegistryContract(
  hre: HardhatRuntimeEnvironment,
  registryNameOrAddress: string
) {
  initRegistry(hre);
  if (registryNameOrAddress.startsWith("0x")) {
    return REGISTRY.data[REGISTRY.index[registryNameOrAddress.toLowerCase()]];
  }
  return REGISTRY.data[registryNameOrAddress];
}

export function updateRegistry(
  hre: HardhatRuntimeEnvironment,
  key: string,
  value: any
) {
  initRegistry(hre);
  const root = resolve(
    __dirname,
    "..",
    "registry",
    hre.network.name,
    `${REGISTRY.timestamp}.json`
  );
  value.address = value.address.toLowerCase();
  REGISTRY.data[key] = value;
  REGISTRY.index[REGISTRY.data[key].address] = key;
  writeFileSync(root, JSON.stringify(REGISTRY.data, null, 2));
}
