import { HomeView } from './views/home/home.view.js';
import { NotFoundView } from './views/not-found/not-found.view.js';

export const appRoutes: Nutin.Routes = {
  '/': () => new HomeView(),
  '/404': () => new NotFoundView(),
}
