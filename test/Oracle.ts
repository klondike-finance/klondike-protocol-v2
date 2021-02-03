import { expect } from "chai";
import { BigNumber, Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";

describe("Oracle", () => {
  let Oracle: ContractFactory;
  let UniswapV2Factory: ContractFactory;
  let UniswapV2Router: ContractFactory;
  let SyntheticToken: ContractFactory;
  let oracle: Contract;
  let factory: Contract;
  let weth: Contract;
  let stable: Contract;
  let synthetic: Contract;
  let router: Contract;

  async function deployToken(
    tokenFactory: ContractFactory,
    uniswapRouter: Contract,
    name: string,
    decimals: number
  ): Promise<Contract> {
    const token = await tokenFactory.deploy(name, name, decimals);
    const [operator] = await ethers.getSigners();
    const supply = BigNumber.from(10).pow(decimals + 3);
    await token.mint(operator.address, supply);
    await token.approve(uniswapRouter.address, supply);
    return token;
  }

  async function setupUniswap() {
    const [operator] = await ethers.getSigners();
    factory = await UniswapV2Factory.deploy(operator.address);
    router = await UniswapV2Router.deploy(factory.address, operator.address);
    stable = await deployToken(SyntheticToken, router, "WBTC", 8);
    synthetic = await deployToken(SyntheticToken, router, "KBTC", 18);
    await router.addLiquidity(
      stable.address,
      synthetic.address,
      BigNumber.from(10).pow(8),
      BigNumber.from(10).pow(18),
      BigNumber.from(10).pow(8),
      BigNumber.from(10).pow(18),
      operator.address,
      Math.floor(new Date().getTime() / 1000) + 60
    );
  }

  before(async () => {
    const [operator] = await ethers.getSigners();
    Oracle = await ethers.getContractFactory("Oracle");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    UniswapV2Factory = new ContractFactory(
      UniswapV2FactoryBuild.abi,
      UniswapV2FactoryBuild.bytecode
    ).connect(operator);
    UniswapV2Router = new ContractFactory(
      UniswapV2RouterBuild.abi,
      UniswapV2RouterBuild.bytecode
    ).connect(operator);
  });

  beforeEach(async () => {
    await setupUniswap();
  });

  describe("#update", () => {
    describe("before start time", () => {
      it("fails", async () => {
        oracle = await Oracle.deploy(
          factory.address,
          stable.address,
          synthetic.address,
          3600,
          new Date().getTime() + 1000
        );
        await expect(oracle.update()).to.be.revertedWith(
          "Timeboundable: Not started yet"
        );
      });
    });
  });
});
