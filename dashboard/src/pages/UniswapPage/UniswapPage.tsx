import { Grid, Paper } from '@material-ui/core';
import UniswapPool from '../../components/UniswapPool';
import { getDeployments, pairFor, UNISWAP_V2_FACTORY_ADDRESS } from '../../lib/utils';

const UniswapPage = () => {
  return (
    <Grid container spacing={3}>
      {getUniswapPools().map((pool) => (
        <UniswapPool key={pool.pair} {...pool} />
      ))}
    </Grid>
  );
};

const getUniswapPools = () => {
  const deployments = getDeployments();
  const kwbtc = deployments['KWBTC'];
  const wbtc = deployments['WBTC'];
  const klonx = deployments['KlonX'];
  const wbtcKwbtcLp = pairFor(UNISWAP_V2_FACTORY_ADDRESS, wbtc.address, kwbtc.address);
  const klonxDaiLp = pairFor(UNISWAP_V2_FACTORY_ADDRESS, wbtc.address, klonx.address);
  return [
    { token0: 'WBTC', token1: 'KWBTC', pair: wbtcKwbtcLp },
    { token0: 'WBTC', token1: 'KlonX', pair: klonxDaiLp },
  ];
};

export default UniswapPage;
