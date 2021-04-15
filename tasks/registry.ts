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
  data: {} as { [key: string]: any },
  index: {} as { [key: string]: any },
  timestamp: new Date().toISOString(),
  initialized: false,
};

export function initRegistry(hre: HardhatRuntimeEnvironment) {
  if (REGISTRY.initialized || process.env["REDEPLOY"]) {
    return;
  }
  const root = resolve(__dirname, "..", "registry", hre.network.name);
  try {
    mkdirSync(root, { recursive: true });
  } catch (e) {}

  const files = readdirSync(root).map((f) => resolve(root, f));
  if (!files || !files.length) {
    REGISTRY.initialized = true;
    return;
  }
  REGISTRY.data = JSON.parse(
    readFileSync(resolve(root, "latest.json")).toString()
  );
  for (const name in REGISTRY.data) {
    REGISTRY.index[REGISTRY.data[name].address] = name;
  }
  REGISTRY.initialized = true;
}

export function getAllRegistryContracts(hre: HardhatRuntimeEnvironment) {
  initRegistry(hre);
  return Object.keys(REGISTRY.data);
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
  value.address = value.address.toLowerCase();
  REGISTRY.data[key] = value;
  REGISTRY.index[REGISTRY.data[key].address] = key;
  const timestamped = resolve(
    __dirname,
    "..",
    "registry",
    hre.network.name,
    `${REGISTRY.timestamp}.json`
  );
  writeFileSync(timestamped, JSON.stringify(REGISTRY.data, null, 2));
  const latest = resolve(
    __dirname,
    "..",
    "registry",
    hre.network.name,
    `latest.json`
  );
  writeFileSync(latest, JSON.stringify(REGISTRY.data, null, 2));
}

export function writeIfMissing(
  hre: HardhatRuntimeEnvironment,
  registryName: string,
  defaultValue: any
) {
  initRegistry(hre);
  if (!getRegistryContract(hre, registryName)) {
    updateRegistry(hre, registryName, defaultValue);
  }
}
