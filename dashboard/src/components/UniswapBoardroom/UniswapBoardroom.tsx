import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate, toDecimal } from '../../lib/utils';
import Entry from '../Entry';

const UniswapBoardroom = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['UniswapBoardroomV1'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const tokenManager = await pool.tokenManager();
        const emissionManager = await pool.emissionManager();
        const stakingToken = await pool.stakingToken();

        const start = await pool.start();
        const finish = await pool.finish();

        const stakingTokenSupply = await pool.stakingTokenSupply();
        const shareTokenSupply = await pool.shareTokenSupply();
        const stakingTokenContract = new ethers.Contract(stakingToken, deployments['KlonX'].abi, provider);
        const shareTokenContract = new ethers.Contract(stakingToken, deployments['KlonX'].abi, provider);
        const stakingTokenDecimals = await stakingTokenContract.decimals();
        const shareTokenDecimals = await shareTokenContract.decimals();

        const pause = await pool.pause();
        const lpPool = await pool.lpPool();


        const values = {
          owner,
          operator,
          tokenManager,
          emissionManager,
          stakingToken,
          lpPool,
          blank1: null,
          start: toDate(start),
          finish: toDate(finish),
          pause,
          blank2: null,
          stakingTokenSupply: toDecimal(stakingTokenSupply, stakingTokenDecimals),
          shareTokenSupply: toDecimal(shareTokenSupply, shareTokenDecimals),
        };
        setData(values);
      } catch (e) {
        setError(e);
      }
    })();
  }, [provider, deployments]);

  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader
          title="UniswapBoardroomV1"
          subheader={deployments && <Entry v={deployments['UniswapBoardroomV1'].address} />}
        />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default UniswapBoardroom;
