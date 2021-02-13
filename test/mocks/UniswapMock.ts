import { ContractFactory } from "ethers";
import { ethers } from "hardhat";

describe("UniswapMock", () => {
  describe("#constructor", () => {
    it("creates a UniswapRouterMock and UniswapFactoryMock", async () => {
      const UniswapRouterMock = await ethers.getContractFactory(
        "UniswapV2RouterMock"
      );
      const UniswapFactoryMock = await ethers.getContractFactory(
        "UniswapV2FactoryMock"
      );
      const f = await UniswapFactoryMock.deploy(ethers.constants.AddressZero);
      await UniswapRouterMock.deploy(f.address, ethers.constants.AddressZero);
    });
  });
});
