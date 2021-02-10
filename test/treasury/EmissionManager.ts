import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { BTC, ETH } from "../../tasks/utils";
import {
  addUniswapPair,
  deployToken,
  deployUniswap,
  fastForwardAndMine,
  now,
} from "../helpers/helpers";

describe("EmissionManager", () => {
  const PERIOD = 86400;
  const DEV_FUND_RATE = 2;
  const STABLE_FUND_RATE = 70;
  const THRESHOLD = 105;
  let TokenManager: ContractFactory;
  let BondManager: ContractFactory;
  let EmissionManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let BoardroomMock: ContractFactory;
  let factory: Contract;
  let router: Contract;
  let manager: Contract;
  let bondManager: Contract;
  let tokenManager: Contract;
  let boardroomMock: Contract;
  let op: SignerWithAddress;
  let devFund: SignerWithAddress;
  let stableFund: SignerWithAddress;
  let oracle: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;
  let pair: Contract;

  before(async () => {
    const [operator, df, sf] = await ethers.getSigners();
    op = operator;
    devFund = df;
    stableFund = sf;
    TokenManager = await ethers.getContractFactory("TokenManager");
    BondManager = await ethers.getContractFactory("BondManager");
    EmissionManager = await ethers.getContractFactory("EmissionManager");
    BoardroomMock = await ethers.getContractFactory("BoardroomMock");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    BoardroomMock = await ethers.getContractFactory("BoardroomMock");
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
  });
  beforeEach(async () => {
    tokenManager = await TokenManager.deploy(factory.address);
    bondManager = await BondManager.deploy(await now());
    manager = await EmissionManager.deploy(await now(), PERIOD);
    boardroomMock = await BoardroomMock.deploy();
    await tokenManager.setBondManager(bondManager.address);
    await tokenManager.setEmissionManager(manager.address);
    await bondManager.setTokenManager(tokenManager.address);
    await manager.setTokenManager(tokenManager.address);
    await manager.setBondManager(bondManager.address);
    await manager.setBoardroom(boardroomMock.address);
    await manager.setStableFund(stableFund.address);
    await manager.setDevFund(devFund.address);
    await manager.setDevFundRate(2);
    await manager.setStableFundRate(70);
    await manager.setThreshold(105);
  });

  async function addPair(
    underlyingDecimals: number,
    syntheticDecimals: number,
    bondDecimals?: number,
    bondSupply?: BigNumber
  ) {
    const bondDecs = bondDecimals || syntheticDecimals;
    const { underlying: u, synthetic: s, pair: p } = await addUniswapPair(
      factory,
      router,
      "WBTC",
      underlyingDecimals,
      "KBTC",
      syntheticDecimals
    );
    bond = await deployToken(
      SyntheticToken,
      router,
      "KBond",
      bondDecs,
      bondSupply
    );
    underlying = u;
    synthetic = s;
    pair = p;
    oracle = await Oracle.deploy(
      factory.address,
      underlying.address,
      synthetic.address,
      3600,
      await now()
    );
    await underlying.transferOperator(tokenManager.address);
    await underlying.transferOwnership(tokenManager.address);
    await synthetic.transferOperator(tokenManager.address);
    await synthetic.transferOwnership(tokenManager.address);
    await bond.transferOperator(bondManager.address);
    await bond.transferOwnership(bondManager.address);
    await tokenManager.addToken(
      synthetic.address,
      bond.address,
      underlying.address,
      oracle.address
    );
  }

  // describe("#constructor", () => {
  //   it("creates a new EmissionManager", async () => {
  //     await expect(EmissionManager.deploy(await now(), PERIOD)).to.not.be
  //       .reverted;
  //   });
  // });

  // describe("#isInitialized", () => {
  //   describe("when all parameters are set", () => {
  //     it("returns true", async () => {
  //       expect(await manager.isInitialized()).to.eq(true);
  //     });
  //   });
  //   describe("when some parameters are not set", () => {
  //     it("returns false", async () => {
  //       await manager.setDevFundRate(0);
  //       expect(await manager.isInitialized()).to.eq(false);
  //     });
  //   });
  // });

  // describe("#positiveRebaseAmount", () => {
  //   describe("price move up 20% and threshold is 105", () => {
  //     it("returns the rebase amount", async () => {
  //       await addPair(8, 18);
  //       const expectedNewSyn = 1.1;
  //       const expectedNewUnd = 1 / expectedNewSyn;
  //       const newPrice = expectedNewSyn / expectedNewUnd;
  //       const priceMovePercent = newPrice - 1;
  //       await router.swapExactTokensForTokens(
  //         BTC,
  //         0,
  //         [underlying.address, synthetic.address],
  //         op.address,
  //         (await now()) + 1800
  //       );
  //       await tokenManager.updateOracle(synthetic.address);
  //       await fastForwardAndMine(ethers.provider, 3600);
  //       await tokenManager.updateOracle(synthetic.address);
  //       const supply = await synthetic.totalSupply();
  //       const expAmount = supply
  //         .mul(Math.floor(priceMovePercent * 1000))
  //         .div(1000);
  //       const actualAmount = await manager.positiveRebaseAmount(
  //         synthetic.address
  //       );
  //       const exp = expAmount.div(ETH).toNumber();
  //       const act = actualAmount.div(ETH).toNumber();
  //       const delta = Math.abs(exp / act - 1);

  //       expect(delta).to.lte(0.01);
  //     });
  //   });
  //   describe("price move up 2% and threshold is 105", () => {
  //     it("returns 0", async () => {
  //       await addPair(8, 18);
  //       await router.swapExactTokensForTokens(
  //         BTC.div(10),
  //         0,
  //         [underlying.address, synthetic.address],
  //         op.address,
  //         (await now()) + 1800
  //       );
  //       await tokenManager.updateOracle(synthetic.address);
  //       await fastForwardAndMine(ethers.provider, 3600);
  //       await tokenManager.updateOracle(synthetic.address);
  //       expect(await manager.positiveRebaseAmount(synthetic.address)).to.eq(0);
  //     });
  //   });
  //   describe("price move down and threshold is 105", () => {
  //     it("returns 0", async () => {
  //       await addPair(8, 18);
  //       await router.swapExactTokensForTokens(
  //         ETH,
  //         0,
  //         [synthetic.address, underlying.address],
  //         op.address,
  //         (await now()) + 1800
  //       );
  //       await tokenManager.updateOracle(synthetic.address);
  //       await fastForwardAndMine(ethers.provider, 3600);
  //       await tokenManager.updateOracle(synthetic.address);
  //       expect(await manager.positiveRebaseAmount(synthetic.address)).to.eq(0);
  //     });
  //   });
  // });
  describe("#positiveRebaseAmount", () => {
    describe("price move up 20% and threshold is 105", () => {
      describe("zero bonds", () => {
        it("makes rebase", async () => {
          await addPair(8, 18, 18, BigNumber.from(0));
          await router.swapExactTokensForTokens(
            BTC,
            0,
            [underlying.address, synthetic.address],
            op.address,
            (await now()) + 1800
          );
          await tokenManager.updateOracle(synthetic.address);
          await fastForwardAndMine(ethers.provider, 3600);

          const expectedReward = BigNumber.from("209669990000000000000000");
          const expectedDevFundReward = expectedReward
            .mul(DEV_FUND_RATE)
            .div(100);
          const expectedStableFundReward = expectedReward
            .sub(expectedDevFundReward)
            .mul(STABLE_FUND_RATE)
            .div(100);
          const expectedBoardRoomReward = expectedReward
            .sub(expectedDevFundReward)
            .mul(100 - STABLE_FUND_RATE)
            .div(100);
          await expect(manager.makePositiveRebase())
            .to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              devFund.address,
              expectedDevFundReward
            )
            .and.to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              stableFund.address,
              expectedStableFundReward
            )
            .and.to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              boardroomMock.address,
              expectedBoardRoomReward
            );
          expect(await synthetic.balanceOf(devFund.address)).to.eq(
            expectedDevFundReward
          );
          expect(await synthetic.balanceOf(bondManager.address)).to.eq(0);

          expect(await synthetic.balanceOf(stableFund.address)).to.eq(
            expectedStableFundReward
          );
          expect(await synthetic.balanceOf(boardroomMock.address)).to.eq(
            expectedBoardRoomReward
          );
        });
      });
      describe("moderate bonds", () => {
        it("makes rebase", async () => {
          const expectedReward = BigNumber.from("209669990000000000000000");
          const expectedBondReward = expectedReward.div(2);
          await addPair(8, 18, 18, expectedBondReward);
          await router.swapExactTokensForTokens(
            BTC,
            0,
            [underlying.address, synthetic.address],
            op.address,
            (await now()) + 1800
          );
          await tokenManager.updateOracle(synthetic.address);
          await fastForwardAndMine(ethers.provider, 3600);

          const expectedDevFundReward = expectedReward
            .mul(DEV_FUND_RATE)
            .div(100);

          const expectedStableFundReward = expectedReward
            .sub(expectedDevFundReward)
            .sub(expectedBondReward)
            .mul(STABLE_FUND_RATE)
            .div(100);
          const expectedBoardRoomReward = expectedReward
            .sub(expectedDevFundReward)
            .sub(expectedBondReward)
            .mul(100 - STABLE_FUND_RATE)
            .div(100);
          await expect(manager.makePositiveRebase())
            .to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              devFund.address,
              expectedDevFundReward
            )
            .and.to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              bondManager.address,
              expectedBondReward
            )
            .and.to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              stableFund.address,
              expectedStableFundReward
            )
            .and.to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              boardroomMock.address,
              expectedBoardRoomReward
            );
          expect(await synthetic.balanceOf(devFund.address)).to.eq(
            expectedDevFundReward
          );
          expect(await synthetic.balanceOf(bondManager.address)).to.eq(
            expectedBondReward
          );
          expect(await synthetic.balanceOf(stableFund.address)).to.eq(
            expectedStableFundReward
          );
          expect(await synthetic.balanceOf(boardroomMock.address)).to.eq(
            expectedBoardRoomReward
          );
        });
      });
      describe("overflowing bonds", () => {
        it("makes rebase", async () => {
          const expectedReward = BigNumber.from("209669990000000000000000");
          const expectedBondReward = expectedReward;
          await addPair(8, 18, 18, expectedBondReward);
          await router.swapExactTokensForTokens(
            BTC,
            0,
            [underlying.address, synthetic.address],
            op.address,
            (await now()) + 1800
          );
          await tokenManager.updateOracle(synthetic.address);
          await fastForwardAndMine(ethers.provider, 3600);

          const expectedDevFundReward = expectedReward
            .mul(DEV_FUND_RATE)
            .div(100);

          await expect(manager.makePositiveRebase())
            .to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              devFund.address,
              expectedDevFundReward
            )
            .and.to.emit(synthetic, "Transfer")
            .withArgs(
              ethers.constants.AddressZero,
              bondManager.address,
              expectedBondReward.sub(expectedDevFundReward)
            );
          expect(await synthetic.balanceOf(devFund.address)).to.eq(
            expectedDevFundReward
          );
          expect(await synthetic.balanceOf(bondManager.address)).to.eq(
            expectedBondReward.sub(expectedDevFundReward)
          );
          expect(await synthetic.balanceOf(stableFund.address)).to.eq(0);
          expect(await synthetic.balanceOf(boardroomMock.address)).to.eq(0);
        });
      });
    });
    describe("price move up 2% and threshold is 105", () => {
      it("doesn't make a rebase", async () => {
        await addPair(8, 18, 18, BigNumber.from(0));
        await router.swapExactTokensForTokens(
          BTC.div(10),
          0,
          [underlying.address, synthetic.address],
          op.address,
          (await now()) + 1800
        );
        await tokenManager.updateOracle(synthetic.address);
        await fastForwardAndMine(ethers.provider, 3600);
        await manager.makePositiveRebase();
        expect(await synthetic.balanceOf(devFund.address)).to.eq(0);
        expect(await synthetic.balanceOf(bondManager.address)).to.eq(0);
        expect(await synthetic.balanceOf(stableFund.address)).to.eq(0);
        expect(await synthetic.balanceOf(boardroomMock.address)).to.eq(0);
      });
    });
    describe("price move down and threshold is 105", () => {
      it("doesn't make a rebase", async () => {
        await addPair(8, 18, 18, BigNumber.from(0));
        await router.swapExactTokensForTokens(
          ETH,
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );
        await tokenManager.updateOracle(synthetic.address);
        await fastForwardAndMine(ethers.provider, 3600);
        await manager.makePositiveRebase();
        expect(await synthetic.balanceOf(devFund.address)).to.eq(0);
        expect(await synthetic.balanceOf(bondManager.address)).to.eq(0);
        expect(await synthetic.balanceOf(stableFund.address)).to.eq(0);
        expect(await synthetic.balanceOf(boardroomMock.address)).to.eq(0);
      });
    });
  });
});
