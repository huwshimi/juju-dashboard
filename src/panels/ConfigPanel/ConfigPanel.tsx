import type { ListSecretResult } from "@canonical/jujulib/dist/api/facades/secrets/SecretsV2";
import {
  ActionButton,
  Button,
  ConfirmationModal,
} from "@canonical/react-components";
import classnames from "classnames";
import cloneDeep from "clone-deep";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import usePortal from "react-useportal";

import FadeIn from "animations/FadeIn";
import CharmIcon from "components/CharmIcon";
import Panel from "components/Panel";
import type { EntityDetailsRoute } from "components/Routes";
import SecretLabel from "components/secrets/SecretLabel";
import { isSet } from "components/utils";
import useAnalytics from "hooks/useAnalytics";
import useCanManageSecrets from "hooks/useCanManageSecrets";
import useInlineErrors, { type SetError } from "hooks/useInlineErrors";
import {
  useListSecrets,
  useGrantSecret,
  useSetApplicationConfig,
  useGetApplicationConfig,
} from "juju/api-hooks";
import PanelInlineErrors from "panels/PanelInlineErrors";
import { usePanelQueryParams } from "panels/hooks";
import type { ConfirmTypes as DefaultConfirmTypes } from "panels/types";
import { ConfirmType as DefaultConfirmType } from "panels/types";
import bulbImage from "static/images/bulb.svg";
import boxImage from "static/images/no-config-params.svg";
import { actions as jujuActions } from "store/juju";
import { getModelSecrets, getModelByUUID } from "store/juju/selectors";
import { useAppSelector, useAppDispatch } from "store/store";
import { secretIsAppOwned } from "utils";

import BooleanConfig from "./BooleanConfig";
import ChangedKeyValues from "./ChangedKeyValues";
import type { SetNewValue, SetSelectedConfig } from "./ConfigField";
import NumberConfig from "./NumberConfig";
import TextAreaConfig from "./TextAreaConfig";
import {
  Label,
  TestId,
  type Config,
  type ConfigData,
  type ConfigValue,
} from "./types";
import { getRequiredGrants } from "./utils";

import "./_config-panel.scss";

enum InlineErrors {
  FORM = "form",
  GET_CONFIG = "get-config",
  SUBMIT_TO_JUJU = "submit-to-juju",
}

enum ConfigConfirmType {
  GRANT = "grant",
}

type ConfirmTypes = DefaultConfirmTypes | ConfigConfirmType;

type ConfigQueryParams = {
  panel: string | null;
  charm: string | null;
  entity: string | null;
  modelUUID: string | null;
};

const hasChangedFields = (newConfig: Config): boolean => {
  return Object.keys(newConfig).some(
    (key) =>
      isSet(newConfig[key].newValue) &&
      newConfig[key].newValue !== newConfig[key].value,
  );
};

const hasErrors = (config: Config) =>
  Object.values(config).some((field) => field.error);

export default function ConfigPanel(): JSX.Element {
  const dispatch = useAppDispatch();
  const [config, setConfig] = useState<Config>({});
  const [selectedConfig, setSelectedConfig] = useState<ConfigData | undefined>(
    undefined,
  );
  const [enableSave, setEnableSave] = useState<boolean>(false);
  const [showResetAll, setShowResetAll] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [confirmType, setConfirmType] = useState<ConfirmTypes>(null);
  const [inlineErrors, setInlineError] = useInlineErrors({
    [InlineErrors.GET_CONFIG]: (error) => (
      <>
        {error} Try{" "}
        <Button
          appearance="link"
          onClick={(event) => {
            event.stopPropagation();
            getConfigCallback();
          }}
        >
          refetching
        </Button>{" "}
        the config data.
      </>
    ),
  });
  const scrollArea = useRef<HTMLDivElement>(null);
  const sendAnalytics = useAnalytics();
  const { Portal } = usePortal();
  const updateConfig = useCallback((newConfig: Config) => {
    setConfig(newConfig);
    checkAllDefaults(newConfig);
    checkEnableSave(newConfig);
  }, []);

  const defaultQueryParams: ConfigQueryParams = {
    panel: null,
    charm: null,
    entity: null,
    modelUUID: null,
  };
  const { userName, modelName } = useParams<EntityDetailsRoute>();
  const [queryParams, , handleRemovePanelQueryParams] =
    usePanelQueryParams<ConfigQueryParams>(defaultQueryParams);
  const { entity: appName, charm, modelUUID } = queryParams;
  const hasConfig = !isLoading && !!config && Object.keys(config).length > 0;
  const secrets = useAppSelector((state) => getModelSecrets(state, modelUUID));
  const wsControllerURL = useAppSelector((state) =>
    getModelByUUID(state, modelUUID),
  )?.wsControllerURL;
  const canManageSecrets = useCanManageSecrets();
  const grantSecret = useGrantSecret(userName, modelName);
  const listSecrets = useListSecrets(userName, modelName);
  const getApplicationConfig = useGetApplicationConfig(userName, modelName);
  const setApplicationConfig = useSetApplicationConfig(userName, modelName);

  useEffect(() => {
    listSecrets();
    return () => {
      if (!modelUUID || !wsControllerURL) {
        return;
      }
      dispatch(jujuActions.clearSecrets({ modelUUID, wsControllerURL }));
    };
  }, [dispatch, listSecrets, modelUUID, wsControllerURL]);

  const getConfigCallback = useCallback(() => {
    if (modelUUID && appName) {
      getConfig(
        appName,
        setIsLoading,
        updateConfig,
        setInlineError,
        getApplicationConfig,
      );
    }
  }, [appName, getApplicationConfig, modelUUID, setInlineError, updateConfig]);

  useEffect(() => {
    getConfigCallback();
  }, [getConfigCallback]);

  useEffect(() => {
    sendAnalytics({
      category: "User",
      action: "Config panel opened",
    });
  }, [sendAnalytics]);

  function setNewValue(name: string, value: ConfigValue) {
    const newConfig = cloneDeep(config);
    newConfig[name].newValue = value;
    if (newConfig[name].newValue === newConfig[name].value) {
      delete newConfig[name].newValue;
    }
    updateConfig(newConfig);
  }

  function setError(name: string, error?: string | null) {
    const newConfig = cloneDeep(config);
    newConfig[name].error = error;
    setConfig(newConfig);
  }

  function checkAllDefaults(config: Config) {
    const shouldShow = Object.keys(config).some((key) => {
      const cfg = config[key];
      if (isSet(cfg.newValue)) {
        if (cfg.newValue === cfg.default) {
          return false;
        } else if (cfg.newValue !== cfg.default) {
          return true;
        }
      } else if (cfg.value !== cfg.default) {
        return true;
      }
      return false;
    });
    setShowResetAll(shouldShow);
  }

  function allFieldsToDefault() {
    const newConfig = cloneDeep(config);
    Object.keys(newConfig).forEach((key) => {
      const cfg = newConfig[key];
      if (cfg.value !== cfg.default) {
        cfg.newValue = cfg.default;
      } else if (cfg.newValue !== cfg.default) {
        cfg.newValue = cfg.default;
      }
    });
    updateConfig(newConfig);
  }

  function checkEnableSave(newConfig: Config) {
    const fieldChanged = hasChangedFields(newConfig);
    setEnableSave(fieldChanged);
  }

  async function _submitToJuju() {
    if (!modelUUID || !appName) {
      return;
    }
    setSavingConfig(true);
    const response = await setApplicationConfig(appName, config);
    const errors = response?.results?.reduce<string[]>((collection, result) => {
      if (result.error) {
        collection.push(result.error.message);
      }
      return collection;
    }, []);
    setSavingConfig(false);
    setEnableSave(false);
    setConfirmType(null);
    if (errors?.length) {
      setInlineError(InlineErrors.FORM, errors);
      return;
    }
    sendAnalytics({
      category: "User",
      action: "Config values updated",
    });
    if (
      canManageSecrets &&
      getRequiredGrants(appName, config, secrets)?.length
    ) {
      setConfirmType(ConfigConfirmType.GRANT);
    } else {
      handleRemovePanelQueryParams();
    }
  }

  function generateConfirmationDialog(): JSX.Element | null {
    if (confirmType && appName) {
      if (confirmType === DefaultConfirmType.SUBMIT) {
        // Render the submit confirmation modal.
        return (
          <Portal>
            <ConfirmationModal
              // Prevent clicks inside this panel from closing the parent panel.
              // This is handled in `checkCanClose`.
              className="prevent-panel-close"
              title={Label.SAVE_CONFIRM}
              confirmExtra={
                <p className="u-text--muted p-text--small u-align--left">
                  You can revert back to the applications default settings by
                  clicking the “Reset all values” button; or reset each edited
                  field by clicking “Use default”.
                </p>
              }
              cancelButtonLabel={Label.SAVE_CONFIRM_CANCEL_BUTTON}
              confirmButtonLabel={Label.SAVE_CONFIRM_CONFIRM_BUTTON}
              confirmButtonAppearance="positive"
              onConfirm={() => {
                setConfirmType(null);
                // Clear the form errors if there were any from a previous submit.
                setInlineError(InlineErrors.FORM, null);
                _submitToJuju().catch((error) => {
                  setInlineError(
                    InlineErrors.SUBMIT_TO_JUJU,
                    Label.SUBMIT_TO_JUJU_ERROR,
                  );
                  console.error(Label.SUBMIT_TO_JUJU_ERROR, error);
                });
              }}
              close={() => setConfirmType(null)}
            >
              <ChangedKeyValues appName={appName} config={config} />
            </ConfirmationModal>
          </Portal>
        );
      }
      if (confirmType === ConfigConfirmType.GRANT) {
        // Render the grant confirmation modal.
        const requiredGrants = getRequiredGrants(appName, config, secrets);
        return (
          <Portal>
            <ConfirmationModal
              // Prevent clicks inside this panel from closing the parent panel.
              // This is handled in `checkCanClose`.
              className="prevent-panel-close"
              title={Label.GRANT_CONFIRM}
              cancelButtonLabel={Label.GRANT_CANCEL_BUTTON}
              confirmButtonLabel={Label.GRANT_CONFIRM_BUTTON}
              confirmButtonAppearance="positive"
              onConfirm={() => {
                setConfirmType(null);
                // Clear the form errors if there were any from a previous submit.
                setInlineError(InlineErrors.FORM, null);
                if (!appName || !requiredGrants) {
                  // It is not possible to get to this point if these
                  // variables aren't set.
                  return;
                }
                void (async () => {
                  try {
                    for (const secretURI of requiredGrants) {
                      await grantSecret(secretURI, [appName]);
                    }
                    setConfirmType(null);
                    handleRemovePanelQueryParams();
                  } catch (error) {
                    setInlineError(
                      InlineErrors.SUBMIT_TO_JUJU,
                      Label.GRANT_ERROR,
                    );
                    console.error(Label.GRANT_ERROR, error);
                  }
                })();
              }}
              close={() => {
                setConfirmType(null);
                handleRemovePanelQueryParams();
              }}
            >
              <p>
                Would you like to grant access to this application for the
                following secrets?
              </p>
              <ul>
                {requiredGrants?.map((secretURI) => {
                  const secret = secrets?.find(({ uri }) => uri === secretURI);
                  return (
                    <li key={secretURI}>
                      {secret ? <SecretLabel secret={secret} /> : secretURI}
                    </li>
                  );
                })}
              </ul>
            </ConfirmationModal>
          </Portal>
        );
      }
      if (confirmType === "cancel") {
        // Render the cancel confirmation modal.
        return (
          <Portal>
            <ConfirmationModal
              className="prevent-panel-close"
              title={Label.CANCEL_CONFIRM}
              cancelButtonLabel={Label.CANCEL_CONFIRM_CANCEL_BUTTON}
              confirmButtonLabel={Label.CANCEL_CONFIRM_CONFIRM_BUTTON}
              onConfirm={() => {
                setConfirmType(null);
                handleRemovePanelQueryParams();
              }}
              close={() => setConfirmType(null)}
            >
              <ChangedKeyValues appName={appName} config={config} />
            </ConfirmationModal>
          </Portal>
        );
      }
    }
    return null;
  }

  function checkCanClose(event: KeyboardEvent | MouseEvent) {
    if (!("code" in event)) {
      const target = event.target as HTMLElement;
      if (
        // The confirmation opens over the panel so need to prevent clicks
        // inside that panel from triggering a new confirmation.
        target.closest(".prevent-panel-close") ||
        target.closest(".p-panel")
      ) {
        return false;
      }
    }
    if (hasChangedFields(config)) {
      // They are trying to close the panel but the user has
      // unchanged values so show the confirmation dialog.
      setConfirmType(DefaultConfirmType.CANCEL);
      return false;
    }
    return true;
  }

  return (
    <Panel
      checkCanClose={checkCanClose}
      data-testid={TestId.PANEL}
      drawer={
        hasConfig ? (
          <>
            <Button
              onClick={() =>
                hasChangedFields(config)
                  ? setConfirmType(DefaultConfirmType.CANCEL)
                  : handleRemovePanelQueryParams()
              }
            >
              {Label.CANCEL_BUTTON}
            </Button>
            <ActionButton
              appearance="positive"
              onClick={() => setConfirmType(DefaultConfirmType.SUBMIT)}
              disabled={!enableSave || savingConfig || hasErrors(config)}
              loading={savingConfig}
            >
              {Label.SAVE_BUTTON}
            </ActionButton>
          </>
        ) : null
      }
      panelClassName="config-panel"
      isSplit={hasConfig}
      loading={isLoading}
      ref={scrollArea}
      title={
        <>
          {appName && charm ? (
            <CharmIcon name={appName} charmId={charm} />
          ) : null}{" "}
          {appName}
        </>
      }
      onRemovePanelQueryParams={handleRemovePanelQueryParams}
      splitContent={
        hasConfig ? (
          <div className="config-panel__description">
            {selectedConfig ? (
              <FadeIn key={selectedConfig.name} isActive={true}>
                <>
                  <h4 className="p-heading--5">Configuration description</h4>
                  <h5>{selectedConfig.name}</h5>
                  <pre>{selectedConfig.description}</pre>
                </>
              </FadeIn>
            ) : (
              <div className="u-align--center">
                <div className="config-panel__message">
                  <img src={bulbImage} alt="" />
                  <h4>
                    Click on a configuration row to view its related description
                    and parameters
                  </h4>
                </div>
              </div>
            )}
          </div>
        ) : null
      }
    >
      <>
        {hasConfig && !isLoading ? (
          <>
            <div className="config-panel__list-header">
              <h5>Configure</h5>
              <div
                className={classnames("config-panel__reset-all", {
                  "config-panel__hide-button": !showResetAll,
                  "config-panel__show-button": showResetAll,
                })}
              >
                <button
                  className="u-button-neutral"
                  onClick={allFieldsToDefault}
                >
                  {Label.RESET_BUTTON}
                </button>
              </div>
            </div>

            <div className="config-panel__list">
              <PanelInlineErrors
                inlineErrors={inlineErrors}
                scrollArea={scrollArea.current}
              />
              {generateConfigElementList(
                config,
                selectedConfig,
                setSelectedConfig,
                setNewValue,
                setError,
                secrets,
              )}
            </div>
            {generateConfirmationDialog()}
          </>
        ) : (
          <FadeIn isActive={true} className="u-align--center">
            <PanelInlineErrors
              inlineErrors={inlineErrors}
              scrollArea={scrollArea.current}
            />
            <div className="config-panel__message">
              <img src={boxImage} alt="" />
              <h4>{Label.NONE}</h4>
            </div>
          </FadeIn>
        )}
      </>
    </Panel>
  );
}

function getConfig(
  appName: string,
  setIsLoading: (value: boolean) => void,
  updateConfig: (value: Config) => void,
  setInlineError: SetError,
  getApplicationConfig: ReturnType<typeof useGetApplicationConfig>,
) {
  setIsLoading(true);
  getApplicationConfig(appName)
    .then((result) => {
      // Add the key to the config object to make for easier use later.
      const config: Config = {};
      // The config param can be null.
      Object.keys(result?.config ?? {}).forEach((key) => {
        config[key] = result?.config[key];
        config[key].name = key;
      });
      updateConfig(config);
      setInlineError(InlineErrors.GET_CONFIG, null);
      return;
    })
    .catch((error) => {
      setInlineError(InlineErrors.GET_CONFIG, Label.GET_CONFIG_ERROR);
      console.error(Label.GET_CONFIG_ERROR, error);
    })
    .finally(() => setIsLoading(false));
}

function generateConfigElementList(
  configs: Config,
  selectedConfig: ConfigData | undefined,
  setSelectedConfig: SetSelectedConfig,
  setNewValue: SetNewValue,
  setError: (name: string, error?: string | null) => void,
  secrets?: ListSecretResult[] | null,
) {
  const elements = Object.keys(configs).map((key) => {
    const config = configs[key];
    if (config.type === "boolean") {
      return (
        <BooleanConfig
          key={config.name}
          config={config}
          selectedConfig={selectedConfig}
          setSelectedConfig={setSelectedConfig}
          setNewValue={setNewValue}
        />
      );
    } else if (config.type === "int") {
      return (
        <NumberConfig
          key={config.name}
          config={config}
          selectedConfig={selectedConfig}
          setSelectedConfig={setSelectedConfig}
          setNewValue={setNewValue}
        />
      );
    } else {
      return (
        <TextAreaConfig
          key={config.name}
          config={config}
          selectedConfig={selectedConfig}
          setSelectedConfig={setSelectedConfig}
          setNewValue={setNewValue}
          validate={(validateConfig) => {
            if (
              validateConfig.type !== "secret" &&
              validateConfig.type !== "string"
            ) {
              // This field is only displayed for string and secret fields so we
              // need to narrow the config to only have the valid types.
              return;
            }
            if (!validateConfig.newValue) {
              // Clear previous errors
              if (validateConfig.error) {
                setError(validateConfig.name, null);
              }
              // Don't validate unchanged fields.
              return;
            }
            if (
              validateConfig.type === "secret" &&
              !validateConfig.newValue.startsWith("secret:")
            ) {
              setError(validateConfig.name, Label.SECRET_PREFIX_ERROR);
              return;
            }
            if (
              ((validateConfig.type === "string" &&
                validateConfig.newValue.startsWith("secret:")) ||
                validateConfig.type === "secret") &&
              secrets
            ) {
              const validSecrets = secrets.reduce<string[]>(
                (validURIs, secret) => {
                  if (!secretIsAppOwned(secret)) {
                    validURIs.push(secret.uri);
                  }
                  return validURIs;
                },
                [],
              );
              if (!validSecrets.includes(validateConfig.newValue)) {
                setError(validateConfig.name, Label.INVALID_SECRET_ERROR);
                return;
              }
            }
            // Clear previous errors.
            if (validateConfig.error) {
              setError(validateConfig.name, null);
            }
          }}
        />
      );
    }
  });

  return elements;
}
