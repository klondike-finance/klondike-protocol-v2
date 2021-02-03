import { expect } from "chai";
import { BigNumber, Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";

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
    uniswapFactory: Contract,
    name: string,
    decimals: number
  ): Promise<Contract> {
    const token = await tokenFactory.deploy(name, name, decimals);
    const [operator] = await ethers.getSigners();
    const supply = BigNumber.from(10).pow(decimals + 3);
    await token.mint(operator, supply);
    await token.approve(uniswapFactory.address, supply);
    return token;
  }

  async function setupUniswap() {
    factory = await UniswapV2Factory.deploy(ethers.constants.AddressZero);
    weth = await deployToken(SyntheticToken, factory, "WETH", 18);
    stable = await deployToken(SyntheticToken, factory, "WBTC", 8);
    synthetic = await deployToken(SyntheticToken, factory, "KBTC", 18);
    router = await UniswapV2Router.deploy(factory.address, weth.address);
    const [operator] = await ethers.getSigners();
    await router.addLiquidity(
      stable.address,
      synthetic.address,
      BigNumber.from(10).pow(8),
      BigNumber.from(10).pow(18),
      BigNumber.from(10).pow(8),
      BigNumber.from(10).pow(18),
      operator,
      Math.floor(new Date().getTime() / 1000) + 60
    );
  }

  before(async () => {
    Oracle = await ethers.getContractFactory("Oracle");
    UniswapV2Factory = await ethers.getContractFactory("UniswapV2FactoryMock");
    UniswapV2Router = await ethers.getContractFactory("UniswapV2Router");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
  });

  describe("#update", () => {
    describe("before start time", () => {
      before(async () => {
        await setupUniswap();
      });
    });
  });
});
