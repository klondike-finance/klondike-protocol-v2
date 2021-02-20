import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';

type PropsType = { name: string };

const RewardPool = ({ name }: PropsType) => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments || !name) return;
      const { address, abi } = deployments[name];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const owner = await pool.owner();
        const rewardsDistribution = await pool.rewardsDistribution();
        const rewardsToken = await pool.rewardsToken();
        const stakingToken = await pool.stakingToken();
        const periodFinish = toDate(await pool.periodFinish());
        const rewardsDuration = await pool.rewardsDuration();
        const rewardRate = await pool.rewardRate();
        const rewardPerToken = await pool.rewardPerToken();
        const rewardPerTokenStored = await pool.rewardPerTokenStored();
        const totalSupply = await pool.totalSupply();
        const lastTimeRewardApplicable = await pool.lastTimeRewardApplicable();
        const lastUpdateTime = await pool.lastUpdateTime();
        const paused = await pool.paused();
        const values = {
          owner,
          rewardsDistribution,
          rewardsToken,
          stakingToken,
          blank1: null,
          periodFinish,
          rewardsDuration,
          blank2: null,
          rewardRate,
          rewardPerToken,
          rewardPerTokenStored,
          totalSupply,
          blank3: null,
          lastTimeRewardApplicable,
          lastUpdateTime,
          paused,
        };
        setData(values);
      } catch (e) {
        setError(e);
      }
    })();
  }, [name, provider, deployments]);

  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title={name} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default RewardPool;
