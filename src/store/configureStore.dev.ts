import { createStore, applyMiddleware, compose, Middleware, StoreEnhancer } from 'redux';
import thunk from 'redux-thunk';
import { createLogger } from 'redux-logger';
import rootReducer from '../reducers';
import { RootState, AppStore } from '../redux/types';

const configureStore = (initialState?: RootState): AppStore => {
  // Redux Configuration
  const middleware: Middleware[] = [];
  const enhancers: StoreEnhancer[] = [];

  // Thunk Middleware
  middleware.push(thunk);

  // Logging Middleware
  const logger = createLogger({
    level: 'info',
    collapsed: true
  });

  // Skip redux logs in console during the tests
  if (process.env.NODE_ENV !== 'test') {
    middleware.push(logger);
  }

  // If Redux DevTools Extension is installed use it, otherwise use Redux compose.
  // `window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__` is a browser-extension global
  // with no official type definitions (see react-app-env.d.ts's ambient
  // declaration) -- its presence/absence is what decides whether `compose`
  // (both are structurally interchangeable at the call site below) comes
  // from the extension or from redux itself.
  /* eslint-disable no-underscore-dangle */
  const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({})
    : compose;
  /* eslint-enable no-underscore-dangle */

  // Apply Middleware & Compose Enhancers
  enhancers.push(applyMiddleware(...middleware));
  const enhancer: StoreEnhancer = composeEnhancers(...enhancers);

  // Create Store
  const store = createStore(rootReducer, initialState, enhancer);
  return store as AppStore;
};

export default configureStore;
