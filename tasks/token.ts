import { BigNumber, Contract, ethers } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy, findExistingContract } from "./contract";
import { oracleDeploy } from "./oracle";
import { getRegistryContract } from "./registry";
import { addLiquidity } from "./uniswap";
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
  .addParam("value", "Value to be minted", "0", types.string)
  .addFlag(
    "force",
    "Force mint if balance non-zero. By default the task doesn't mint to an address with positive balance"
  )
  .setAction(async ({ name, to, value, force }, hre) => {
    await mint(hre, name, to, BigNumber.from(value), force);
  });

task("token:deploy:triple", "deploy token, bond and oracle")
  .addParam(
    "synName",
    "Name of the token synthetic token",
    undefined,
    types.string
  )
  .addParam("bondName", "Name of the bond", undefined, types.string)
  .addParam("underlying", "Address of the underlying", undefined, types.string)
  .addParam(
    "synLiquidity",
    "Amount of the synthetic liquidity",
    undefined,
    types.string
  )
  .addParam(
    "synUniswapLiquidity",
    "Amount of the synthetic liquidity",
    undefined,
    types.string
  )
  .addParam(
    "undUniswapLiquidity",
    "Amount of the underlying liquidity",
    undefined,
    types.string
  )
  .setAction(
    async (
      {
        synName,
        bondName,
        underlying,
        synLiquidity,
        synUniswapLiquidity,
        undUniswapLiquidity,
      },
      hre
    ) => {
      const [op] = await hre.ethers.getSigners();
      await tokenDeploy(hre, synName, synName);
      await mint(hre, synName, op.address, BigNumber.from(synLiquidity));
      await tokenDeploy(hre, bondName, bondName);
      await addLiquidity(
        hre,
        synName,
        underlying,
        BigNumber.from(synUniswapLiquidity),
        BigNumber.from(undUniswapLiquidity)
      );
      await oracleDeploy(hre, synName, underlying);
    }
  );

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
  if (value.eq(0)) {
    console.log("Value is 0. Skipping...");
    return;
  }
  const { name = "SyntheticToken", address = registryNameOrAddress } =
    getRegistryContract(hre, registryNameOrAddress) || {};
  const contract: Contract = await hre.ethers.getContractAt(name, address);
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

// export async function deployTokens(
//   hre: HardhatRuntimeEnvironment,
//   underlyingRegistryName: string,
//   initialLiquidityMint: BigNumber = BigNumber.from(0)
// ) {
//   console.log(
//     `Deploying 3 tokens for ${underlyingRegistryName} with initial mint ${initialLiquidityMint.toString()}`
//   );

//   const [operator] = await hre.ethers.getSigners();
//   let underlying;
//   if (isProd(hre)) {
//     underlying = await findExistingContract(hre, underlyingRegistryName);
//   } else {
//     underlying = await contractDeploy(
//       hre,
//       "SyntheticToken",
//       underlyingRegistryName,
//       underlyingRegistryName,
//       underlyingRegistryName,
//       8
//     );
//   }
//   const synthetic = await contractDeploy(
//     hre,
//     "SyntheticToken",
//     deriveSyntheticName(underlyingRegistryName),
//     deriveSyntheticName(underlyingRegistryName),
//     deriveSyntheticName(underlyingRegistryName),
//     18
//   );
//   const bond = await contractDeploy(
//     hre,
//     "SyntheticToken",
//     deriveBondName(underlyingRegistryName),
//     deriveBondName(underlyingRegistryName),
//     deriveBondName(underlyingRegistryName),
//     18
//   );
//   const klon = await contractDeploy(
//     hre,
//     "SyntheticToken",
//     "Klon",
//     "Klon",
//     "Klon",
//     18
//   );

//   const jedi = await contractDeploy(
//     hre,
//     "SyntheticToken",
//     "Jedi",
//     "Jedi",
//     "Jedi",
//     18
//   );
//   const droid = await contractDeploy(
//     hre,
//     "SyntheticToken",
//     "Droid",
//     "Droid",
//     "Droid",
//     18
//   );

//   if (isProd(hre)) {
//     await mint(
//       hre,
//       underlyingRegistryName,
//       operator.address,
//       initialLiquidityMint
//     );
//   } else {
//     await mint(
//       hre,
//       deriveSyntheticName(underlyingRegistryName),
//       operator.address,
//       ETH.mul(1000)
//     );
//     await mint(hre, underlyingRegistryName, operator.address, ETH.mul(1000));
//     await mint(hre, "Klon", operator.address, ETH.mul(1000));
//   }
//   console.log("Deployed 5 tokens");

//   return { synthetic, bond, underlying, jedi, droid, klon };
// }

export function deriveSyntheticName(underlyingName: string) {
  return `K${underlyingName}`;
}

export function deriveBondName(underlyingName: string) {
  return `KB-${underlyingName}`;
}

export async function transferFullOwnership(
  hre: HardhatRuntimeEnvironment,
  ownerName: string,
  targetName: string
) {
  await transferOperator(hre, ownerName, targetName);
  await transferOwnership(hre, ownerName, targetName);
}

export async function transferOwnership(
  hre: HardhatRuntimeEnvironment,
  ownerName: string,
  targetName: string
) {
  const owner = await findExistingContract(hre, ownerName);
  const target = await getRegistryContract(hre, targetName);

  console.log(`Transferring owner of ${ownerName} to ${target.address}`);
  const ow = await owner.owner();
  if (ow.toLowerCase() === target.address.toLowerCase()) {
    console.log(
      `${target.address} is already an owner of ${ownerName}. Skipping...`
    );
    return;
  }
  const [signer] = await hre.ethers.getSigners();
  const contractOwner = await owner.owner();
  if (contractOwner.toLowerCase() != signer.address.toLowerCase()) {
    console.log(
      `Tx sender \`${signer.address}\` is not the owner of \`${owner.address}\`. The owner is \`${contractOwner}\`. Skipping...`
    );
    return;
  }

  const tx = await owner.populateTransaction.transferOwnership(target.address);
  await sendTransaction(hre, tx);
}

export async function transferOperator(
  hre: HardhatRuntimeEnvironment,
  ownerName: string,
  targetName: string
) {
  const owner = await findExistingContract(hre, ownerName);
  const target = await getRegistryContract(hre, targetName);
  console.log(`Transferring operator of ${ownerName} to ${target.address}`);
  const op = await owner.operator();
  if (op.toLowerCase() === target.address.toLowerCase()) {
    console.log(
      `${target.address} is already an operator of ${ownerName}. Skipping...`
    );
    return;
  }
  const [signer] = await hre.ethers.getSigners();
  const contractOwner = await owner.owner();
  if (contractOwner.toLowerCase() != signer.address.toLowerCase()) {
    console.log(
      `Tx sender \`${signer.address}\` is not the owner of \`${owner.address}\`. The owner is \`${contractOwner}\`. Skipping...`
    );
    return;
  }
  const tx = await owner.populateTransaction.transferOperator(target.address);
  await sendTransaction(hre, tx);
}
