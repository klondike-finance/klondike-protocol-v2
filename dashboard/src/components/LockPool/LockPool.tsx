import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';

const LockPool = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['DroidJediLockPool'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const boardroom = await pool.boardroom();
        const innerToken = await pool.innerToken();
        const rewardsToken = await pool.rewardsToken();
        const stakingToken = await pool.stakingToken();

        const start = await pool.start();
        const finish = await pool.finish();

        const totalSupply = await pool.totalSupply();
        const rewardDays = await pool.getRewardDays();
        const pauseLock = await pool.pauseLock();
        const validPermissions = await pool.validPermissions();

        const values = {
          owner,
          operator,
          boardroom,
          blank1: null,
          innerToken,
          rewardsToken,
          stakingToken,
          blank2: null,
          start: toDate(start),
          finish: toDate(finish),
          blank3: null,
          totalSupply,
          rewardDays,
          pauseLock,
          validPermissions,
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
          title={'KlonDroid Swap Pool'}
          subheader={deployments && <Entry v={deployments['DroidJediLockPool'].address} />}
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

export default LockPool;
