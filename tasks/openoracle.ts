import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { ParamType } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { findExistingContract } from "./contract";
import { getRegistryContract } from "./registry";
import { sendTransaction } from "./utils";

task("openoracle:update:raw", "Deploys an oracle")
  .addParam("tokenA", "First token name or address in the pair")
  .addParam("tokenB", "Second token name or address in the pair")
  .addParam("price", "price to push (normalized to 10^18)")
  .setAction(async ({ tokenA, tokenB, price }, hre) => {
    await openoracleUpdateRaw(hre, tokenA, tokenB, price);
  });

async function openoracleUpdateRaw(
  hre: HardhatRuntimeEnvironment,
  tokenAName: string,
  tokenBName: string,
  priceStr: string
) {
  const price = BigNumber.from(priceStr);
  const tokenA = (
    await getRegistryContract(hre, tokenAName)
  ).address.toLowerCase();
  const tokenB = (
    await getRegistryContract(hre, tokenBName)
  ).address.toLowerCase();
  const [token0, token1] =
    tokenA > tokenB ? [tokenB, tokenA] : [tokenA, tokenB];
  const key = hre.ethers.utils.defaultAbiCoder.encode(
    [{ type: "address" } as any, { type: "address" } as any],
    [token0, token1]
  );
  const message = hre.ethers.utils.defaultAbiCoder.encode(
    [
      { type: "string" } as any,
      { type: "uint64" } as any,
      { type: "string" } as any,
      { type: "uint64" } as any,
    ],
    ["prices", Math.floor(new Date().getTime() / 1000), key, priceStr]
  );
  SignerWithAddress;
  const bytes = hre.ethers.utils.arrayify(message);
  const hash = hre.ethers.utils.keccak256(bytes);
  const [operator] = await hre.ethers.getSigners();
  const signature = await operator.signMessage(hash);
  const openoraclePriceData = await findExistingContract(
    hre,
    "OpenOraclePriceDataV1"
  );
  const tx = await openoraclePriceData.populateTransaction.put(
    message,
    signature
  );
  console.log("Sending tx with message:", message);
  console.log("Signature:", signature);

  await sendTransaction(hre, tx);
}

// export function sign(messages: string | string[], privateKey: string): SignedMessage[] {
//     const actualMessages = Array.isArray(messages) ? messages : [messages];
//     return actualMessages.map((message) => {
//       const hash = web3.utils.keccak256(message);
//       const {r, s, v} = web3.eth.accounts.sign(hash, privateKey);
//       const signature = web3.eth.abi.encodeParameters(['bytes32', 'bytes32', 'uint8'], [r, s, v]);
//       const signatory = web3.eth.accounts.recover(hash, v, r, s);
//       return {hash, message, signature, signatory};
//     });
//   }
