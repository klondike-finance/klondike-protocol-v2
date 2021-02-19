import { Grid } from '@material-ui/core';
import RewardPool from '../../components/RewardPool';

const PoolsPage = () => {
  const pools = ['KWBTCWBTCLPJediPool', 'DroidDAILPJediPool', 'JediDAILPJediPool'];
  return (
    <Grid container spacing={3}>
      {pools.map((name) => (
        <RewardPool key={name} name={name} />
      ))}
    </Grid>
  );
};

export default PoolsPage;
