import { Grid } from '@material-ui/core';
import RewardPool from '../../components/RewardPool';

const RewardPoolsPage = () => {
  const pools = ['KWBTCWBTCLPKlonXPool', 'KlonXWBTCLPKlonXPool', 'KXUSDDAILPKlonXPool'];
  return (
    <Grid container spacing={3}>
      {pools.map((name) => (
        <RewardPool key={name} name={name} />
      ))}
    </Grid>
  );
};

export default RewardPoolsPage;
