import { Card, CardContent, CardHeader, CircularProgress, Grid, Paper, Typography } from '@material-ui/core';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import UniswapPage from '../../pages/UniswapPage';
import unipairabi from '../../data/unipairabi.json';
import { ethers } from 'ethers';
import { Alert } from '@material-ui/lab';
import styled from 'styled-components';
import Entry from '../Entry';

type PropsType = { pair: string };
type TokenData = { reserve: number; name: string };

const UniswapPool = ({ pair }: PropsType) => {
  const { provider, deployments } = useContext(EthereumContext);
  const [error, setError] = useState(null);
  const [tokenData0, setTokenData0] = useState<TokenData | null>(null);
  const [tokenData1, setTokenData1] = useState<TokenData | null>(null);

  useEffect(() => {
    (async () => {
      const p = new ethers.Contract(pair, unipairabi, provider);
      try {
        if (!deployments) return;
        const [token0, token1] = await Promise.all([p.token0(), p.token1()]);
        const contract0 = new ethers.Contract(token0, deployments['KWBTC'].abi, provider);
        const contract1 = new ethers.Contract(token1, deployments['KWBTC'].abi, provider);
        const [name0, name1] = await Promise.all([contract0.symbol(), contract1.symbol()]);
        const [decimals0, decimals1] = await Promise.all([contract0.decimals(), contract1.decimals()]);
        const [reserve0, reserve1] = await p.getReserves();
        const res0 = reserve0 / 10 ** decimals0;
        const res1 = reserve1 / 10 ** decimals1;
        setTokenData0({ reserve: res0, name: name0 });
        setTokenData1({ reserve: res1, name: name1 });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [pair]);
  if (!deployments) return null;
  const name = tokenData0 && tokenData1 ? `${tokenData0.name} - ${tokenData1.name} Uniswap Pool` : 'Unknown pool';
  const { reserve: reserve0, name: name0 } = tokenData0 || { reserve: 0, name: 'Unknown' };
  const { reserve: reserve1, name: name1 } = tokenData1 || { reserve: 0, name: 'Unknown' };
  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title={name} subheader={<Entry v={pair} />} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {(!reserve0 || !reserve1) && !error && <CircularProgress />}
          <p>{reserve0 && reserve1 && `Reserve0: ${reserve0} ${name0}`}</p>
          <p>{reserve0 && reserve1 && `Reserve1: ${reserve1} ${name1}`}</p>
          <p>{reserve0 && reserve1 && `Price0: ${(reserve1 as any) / (reserve0 as any)} ${name1}/${name0}`}</p>
          <p>{reserve0 && reserve1 && `Price1: ${(reserve0 as any) / (reserve1 as any)} ${name0}/${name1}`}</p>
        </CardContent>
      </Card>
    </Grid>
  );
};

export default UniswapPool;
