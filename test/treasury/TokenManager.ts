import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import { expect } from "chai";

describe("TokenManager", () => {
  let TokenManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let UniswapV2Factory: ContractFactory;
  let UniswapV2Router: ContractFactory;
  let factory: Contract;
  let router: Contract;
  let op: SignerWithAddress;
  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    TokenManager = await ethers.getContractFactory("TokenManager");
    UniswapV2Factory = new ContractFactory(
      UniswapV2FactoryBuild.abi,
      UniswapV2FactoryBuild.bytecode
    ).connect(operator);
    UniswapV2Router = new ContractFactory(
      UniswapV2RouterBuild.abi,
      UniswapV2RouterBuild.bytecode
    ).connect(operator);

    factory = await UniswapV2Factory.deploy(operator.address);
    router = await UniswapV2Router.deploy(factory.address, operator.address);
  });

  async function deployPair() {
    const synToken = await SyntheticToken.deploy("Synthetic", "SYN", 18);
    const undToken = await SyntheticToken.deploy("Underlying", "UND", 18);
  }

  describe("#constructor", () => {
    it("creates an instance of TokenManager", async () => {
      await expect(TokenManager.deploy(factory.address)).to.not.be.reverted;
    });
  });
});
