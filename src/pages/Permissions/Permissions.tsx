import { ReBACAdmin, urls as generateReBACURLS } from "@canonical/rebac-admin";
import type { AxiosError } from "axios";
import { useRef } from "react";
import { NavLink } from "react-router";

import { axiosInstance } from "axios-instance";
import useLogout from "hooks/useLogout";
import { endpoints } from "juju/jimm/api";
import BaseLayout from "layout/BaseLayout/BaseLayout";
import urls from "urls";

import { Label, TestId } from "./types";

const rebacURLS = generateReBACURLS(urls.permissions);

const Permissions = (): JSX.Element => {
  const logout = useLogout();

  useRef(
    axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (
          error.response?.status === 401 &&
          // The 'whoami' endpoint is used to check whether the user is
          // authenticated, so don't display the login screen for these requests as
          // that would cause it to be fetched again and cause an infinite loop.
          error.config?.url !== endpoints().whoami
        ) {
          // Handle any unauthenticated requests and display the login screen.
          logout();
          return null;
        }
        return Promise.reject(error);
      },
    ),
  );

  return (
    <BaseLayout
      data-testid={TestId.COMPONENT}
      secondaryNav={{
        title: "Permissions",
        items: [
          {
            className: "menu-one",
            items: [
              {
                component: NavLink,
                to: rebacURLS.users.index,
                label: <>{Label.USERS}</>,
              },
              {
                component: NavLink,
                to: rebacURLS.groups.index,
                label: <>{Label.GROUPS}</>,
              },
              {
                component: NavLink,
                to: rebacURLS.entitlements,
                label: <>{Label.ENTITLEMENTS}</>,
              },
              {
                component: NavLink,
                to: rebacURLS.resources.index,
                label: <>{Label.RESOURCES}</>,
              },
            ],
          },
        ],
      }}
    >
      <ReBACAdmin axiosInstance={axiosInstance} asidePanelId="app-layout" />
    </BaseLayout>
  );
};

export default Permissions;
