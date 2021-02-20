import { Grid } from '@material-ui/core';
import BondManager from '../../components/BondManager';
import TokenManager from '../../components/TokenManager';

const ManagersPage = () => {
  return (
    <Grid container spacing={3}>
      <TokenManager />
      <BondManager />
    </Grid>
  );
};

export default ManagersPage;
