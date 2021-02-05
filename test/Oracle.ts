import { expect } from "chai";
import { BigNumber, Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import { BTC, ETH, fastForwardAndMine, now, pairFor } from "./helpers/helpers";

describe("Oracle", () => {
  let Oracle: ContractFactory;
  let UniswapV2Factory: ContractFactory;
  let UniswapV2Router: ContractFactory;
  let SyntheticToken: ContractFactory;
  let oracle: Contract;
  let factory: Contract;
  let stable: Contract;
  let synthetic: Contract;
  let router: Contract;
  let pair: Contract;

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
    pair = await ethers.getContractAt(
      "IUniswapV2Pair",
      pairFor(factory.address, stable.address, synthetic.address)
    );
    await router.addLiquidity(
      stable.address,
      synthetic.address,
      BTC,
      ETH,
      BTC,
      ETH,
      operator.address,
      (await now()) + 1000000
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
    await setupUniswap();
  });

  describe("#constructor", () => {
    describe("when some liquidity in the pool", async () => {
      it("succeeds", async () => {
        await expect(
          Oracle.deploy(
            factory.address,
            stable.address,
            synthetic.address,
            3600,
            await now()
          )
        ).to.not.be.reverted;
      });
    });
    describe("when zero liquidity in the pool", async () => {
      it("fails", async () => {
        const [operator] = await ethers.getSigners();
        const factory1 = await UniswapV2Factory.deploy(operator.address);
        const stable1 = await deployToken(SyntheticToken, router, "WBTC", 8);
        const synthetic1 = await deployToken(
          SyntheticToken,
          router,
          "KBTC",
          18
        );
        await factory1.createPair(stable1.address, synthetic1.address);

        await expect(
          Oracle.deploy(
            factory1.address,
            stable1.address,
            synthetic1.address,
            3600,
            await now()
          )
        ).to.be.revertedWith("Oracle: No reserves in the uniswap pool");
      });
    });
  });

  describe("#consult", () => {
    describe("when token address is one of two oracle tokens", () => {
      it("returns price", async () => {
        await setupUniswap();
        oracle = await Oracle.deploy(
          factory.address,
          stable.address,
          synthetic.address,
          3600,
          await now()
        );
        await oracle.update();
        await fastForwardAndMine(ethers.provider, 3600);
        await oracle.update();

        const btcPrice: BigNumber = await oracle.consult(stable.address, BTC);
        expect(btcPrice).to.eq(ETH);
        const ethPrice: BigNumber = await oracle.consult(
          synthetic.address,
          ETH
        );
        // TODO: check off by one
        expect(ethPrice).to.eq(BTC.sub(1));
      });
    });
    describe("when token address is invalid", () => {
      it("fails", async () => {
        oracle = await Oracle.deploy(
          factory.address,
          stable.address,
          synthetic.address,
          3600,
          await now()
        );
        await oracle.update();
        await fastForwardAndMine(ethers.provider, 3600);
        await oracle.update();

        await expect(
          oracle.consult(ethers.constants.AddressZero, BTC)
        ).to.be.revertedWith("Oracle: Invalid token address");
      });
    });
  });

  describe("#update", () => {
    describe("before start time", () => {
      it("fails", async () => {
        oracle = await Oracle.deploy(
          factory.address,
          stable.address,
          synthetic.address,
          3600,
          (await now()) + 30
        );
        await expect(oracle.update()).to.be.revertedWith(
          "Timeboundable: Not started yet"
        );
      });
    });
    describe("after start time", () => {
      describe("when triggered for the first time", () => {
        it("returns some random average price", async () => {
          oracle = await Oracle.deploy(
            factory.address,
            stable.address,
            synthetic.address,
            3600,
            await now()
          );
          await fastForwardAndMine(ethers.provider, 60);
          await oracle.update();
          const btcPrice = await oracle.consult(stable.address, BTC);
          expect(btcPrice.lte(ETH)).to.be.true;
          expect(btcPrice.gte(0)).to.be.true;
        });
      });
      describe("when triggered for the second time", () => {
        describe("with constant price", () => {
          it("returns constant price", async () => {
            oracle = await Oracle.deploy(
              factory.address,
              stable.address,
              synthetic.address,
              3600,
              await now()
            );
            await fastForwardAndMine(ethers.provider, 60);
            await oracle.update();
            await fastForwardAndMine(ethers.provider, 3600);
            await oracle.update();

            const btcPrice: BigNumber = await oracle.consult(
              stable.address,
              BTC
            );
            expect(btcPrice).to.eq(ETH);
            await setupUniswap();
          });
        });
        describe("with growing price", () => {
          it("returns increased price", async () => {
            const [operator] = await ethers.getSigners();
            oracle = await Oracle.deploy(
              factory.address,
              stable.address,
              synthetic.address,
              3600,
              await now()
            );
            // the first trade gives some random starting point for oracle
            await router.swapExactTokensForTokens(
              ETH.div(1000),
              BTC.div(1000).div(2),
              [synthetic.address, stable.address],
              operator.address,
              (await now()) + 1800
            );

            await oracle.update();
            await fastForwardAndMine(ethers.provider, 100);
            await router.swapExactTokensForTokens(
              ETH.div(1000),
              BTC.div(1000).div(2),
              [synthetic.address, stable.address],
              operator.address,
              (await now()) + 1800
            );

            // const [reserveA, reserveB] = (await pair.getReserves()).slice(0, 2);
            // const [synReserve, stableReserve] = reserveA.gt(reserveB)
            //   ? [reserveA, reserveB]
            //   : [reserveB, reserveA];
            // const expectedBtcPrice = synReserve.mul(BTC).div(stableReserve);
            await fastForwardAndMine(ethers.provider, 3500);
            await oracle.update();
            const btcPrice: BigNumber = await oracle.consult(
              stable.address,
              BTC
            );
            expect(btcPrice.gt(ETH)).to.be.true;
            await setupUniswap();
          });
        });
        describe("with declining price", () => {
          it("returns decreased price", async () => {
            const [operator] = await ethers.getSigners();
            oracle = await Oracle.deploy(
              factory.address,
              stable.address,
              synthetic.address,
              3600,
              await now()
            );
            // the first trade gives some random starting point for oracle
            await router.swapExactTokensForTokens(
              ETH.div(1000),
              BTC.div(1000).div(2),
              [synthetic.address, stable.address],
              operator.address,
              (await now()) + 1800
            );

            await oracle.update();
            await fastForwardAndMine(ethers.provider, 100);
            await router.swapExactTokensForTokens(
              BTC.div(1000).mul(2),
              ETH.div(1000),
              [stable.address, synthetic.address],
              operator.address,
              (await now()) + 1800
            );

            await fastForwardAndMine(ethers.provider, 3500);
            await oracle.update();
            const btcPrice: BigNumber = await oracle.consult(
              stable.address,
              BTC
            );
            expect(btcPrice.lt(ETH)).to.be.true;
            await setupUniswap();
          });
        });
      });

      describe("when triggered twice", async () => {
        describe("in one block", () => {
          it("fails", async () => {
            oracle = await Oracle.deploy(
              factory.address,
              stable.address,
              synthetic.address,
              3600,
              await now()
            );
            await oracle.update();
            await expect(oracle.update()).to.be.revertedWith(
              "Debouncable: already called in this time slot"
            );
          });
        });
        describe("in less than `period` time", () => {
          it("fails", async () => {
            oracle = await Oracle.deploy(
              factory.address,
              stable.address,
              synthetic.address,
              3600,
              await now()
            );
            await fastForwardAndMine(ethers.provider, 60);
            await oracle.update();
            await fastForwardAndMine(ethers.provider, 1800);
            await expect(oracle.update()).to.be.revertedWith(
              "Debouncable: already called in this time slot"
            );
          });
        });
        describe("in more than `period` time", () => {
          it("succeeds", async () => {
            oracle = await Oracle.deploy(
              factory.address,
              stable.address,
              synthetic.address,
              3600,
              await now()
            );
            await fastForwardAndMine(ethers.provider, 60);
            await oracle.update();
            await fastForwardAndMine(ethers.provider, 3600);
            await expect(oracle.update()).to.not.be.reverted;
          });
        });
      });
    });
  });
});
