import { Grid } from '@material-ui/core';
import BondManager from '../../components/BondManager';
import EmissionManager from '../../components/EmissionManager';
import TokenManager from '../../components/TokenManager';

const ManagersPage = () => {
  return (
    <Grid container spacing={3}>
      <TokenManager />
      <BondManager />
      <EmissionManager />
    </Grid>
  );
};

export default ManagersPage;
