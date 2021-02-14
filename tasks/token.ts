import { BigNumber, Contract } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy, findExistingContract } from "./contract";
import { getRegistryContract } from "./registry";
import { ETH, isProd, sendTransaction } from "./utils";

task("token:deploy", "Deploys a new synthetic token")
  .addParam("name", "The name of the token", undefined, types.string)
  .addParam("symbol", "The ticker of the token", undefined, types.string)
  .addParam("decimals", "Decimals of the token", 18, types.int)
  .setAction(async ({ name, symbol, decimals }, hre) => {
    await tokenDeploy(hre, name, symbol, decimals);
  });

task("token:mint", "Mints to an address")
  .addParam(
    "name",
    "The name of the token in the registry or deployment address",
    undefined,
    types.string
  )
  .addParam("to", "Address of the receiver", undefined, types.string)
  .addParam("value", "Value to be minted", 0, types.int)
  .addFlag(
    "force",
    "Force mint if balance non-zero. By default the task doesn't mint to an address with positive balance"
  )
  .setAction(async ({ name, to, value, force }, hre) => {
    await mint(hre, name, to, BigNumber.from(value), force);
  });

export async function tokenDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  symbol: string,
  decimals: number = 18
) {
  return await contractDeploy(
    hre,
    "SyntheticToken",
    name,
    name,
    symbol,
    decimals
  );
}

export async function mint(
  hre: HardhatRuntimeEnvironment,
  registryNameOrAddress: string,
  to: string,
  value: BigNumber,
  force: boolean = false
) {
  console.log(
    `Minting \`${registryNameOrAddress}\` token to \`${to}\`, value: ${value}...`
  );

  const tokenRegistryEntry = getRegistryContract(hre, registryNameOrAddress);
  if (!tokenRegistryEntry) {
    throw `Token not found: ${registryNameOrAddress}`;
  }
  const contract: Contract = await hre.ethers.getContractAt(
    tokenRegistryEntry.name,
    tokenRegistryEntry.address
  );
  const balance = await contract.balanceOf(to);
  if (balance > 0 && !force) {
    console.log(
      `Address \`${to}\` already has nonzero balance of token \`${registryNameOrAddress}\` already. Skipping minting...`
    );
    console.log("Done");
    return;
  }

  const tx = await contract.populateTransaction.mint(to, value);
  await sendTransaction(hre, tx);
  console.log("Done");
}

export async function deployTokens(
  hre: HardhatRuntimeEnvironment,
  underlyingRegistryName: string,
  initialLiquidityMint: BigNumber = BigNumber.from(0)
) {
  console.log(
    `Deploying 3 tokens for ${underlyingRegistryName} with initial mint ${initialLiquidityMint.toString()}`
  );

  const [operator] = await hre.ethers.getSigners();
  let underlying;
  if (isProd(hre)) {
    underlying = await findExistingContract(hre, underlyingRegistryName);
  } else {
    underlying = await contractDeploy(
      hre,
      "SyntheticToken",
      underlyingRegistryName,
      underlyingRegistryName,
      underlyingRegistryName,
      8
    );
  }
  const synthetic = await contractDeploy(
    hre,
    "SyntheticToken",
    deriveSyntheticName(underlyingRegistryName),
    deriveSyntheticName(underlyingRegistryName),
    deriveSyntheticName(underlyingRegistryName),
    18
  );
  const bond = await contractDeploy(
    hre,
    "SyntheticToken",
    deriveBondName(underlyingRegistryName),
    deriveBondName(underlyingRegistryName),
    deriveBondName(underlyingRegistryName),
    18
  );
  const klon = await contractDeploy(
    hre,
    "SyntheticToken",
    "Klon",
    "Klon",
    "Klon",
    18
  );

  const droid = await contractDeploy(
    hre,
    "SyntheticToken",
    "Droid",
    "Droid",
    "Droid",
    18
  );
  const jedi = await contractDeploy(
    hre,
    "SyntheticToken",
    "Jedi",
    "Jedi",
    "Jedi",
    18
  );

  if (isProd(hre)) {
    await mint(
      hre,
      underlyingRegistryName,
      operator.address,
      initialLiquidityMint
    );
  } else {
    await mint(
      hre,
      deriveSyntheticName(underlyingRegistryName),
      operator.address,
      ETH.mul(1000)
    );
    await mint(hre, underlyingRegistryName, operator.address, ETH.mul(1000));
    await mint(hre, "Klon", operator.address, ETH.mul(1000));
  }
  console.log("Deployed 5 tokens");

  return { synthetic, bond, underlying, droid, jedi, klon };
}

export function deriveSyntheticName(underlyingName: string) {
  return `K${underlyingName}`;
}

export function deriveBondName(underlyingName: string) {
  return `KB-${underlyingName}`;
}

export async function transferOwnership(
  hre: HardhatRuntimeEnvironment,
  tokenName: string,
  target: string
) {
  const token = await findExistingContract(hre, tokenName);
  console.log(`Transferring operator of ${tokenName} to ${target}`);
  const op = await token.operator();
  if (op.toLowerCase() === target.toLowerCase()) {
    console.log(
      `${target} is already an operator of ${tokenName}. Skipping...`
    );
  } else {
    const tx = await token.populateTransaction.transferOperator(target);
    await sendTransaction(hre, tx);
  }

  console.log(`Transferring owner of ${tokenName} to ${target}`);
  const ow = await token.owner();
  if (ow.toLowerCase() === target.toLowerCase()) {
    console.log(`${target} is already an owner of ${tokenName}. Skipping...`);
  } else {
    const tx = await token.populateTransaction.transferOwnership(target);
    await sendTransaction(hre, tx);
  }
}
