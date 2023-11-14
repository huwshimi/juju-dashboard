import { screen } from "@testing-library/react";
import type { ButtonHTMLAttributes } from "react";

import { renderComponent } from "testing/utils";

import SideNavigationItem from "./SideNavigationItem";

it("displays a link from props", () => {
  const label = "Test content";
  renderComponent(<SideNavigationItem label={label} href="#" />);
  expect(screen.getByRole("link", { name: label })).toHaveClass(
    "p-side-navigation__link"
  );
});

it("can use a custom link component", () => {
  const Link = ({ ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  );
  const label = "Test content";
  renderComponent(<SideNavigationItem label={label} component={Link} />);
  expect(screen.getByRole("button", { name: label })).toHaveClass(
    "p-side-navigation__link"
  );
});

it("can replace link content with children", () => {
  const label = "Test content";
  renderComponent(
    <SideNavigationItem>
      <button>{label}</button>
    </SideNavigationItem>
  );
  expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  expect(
    document.querySelector(".p-side-navigation__link")
  ).not.toBeInTheDocument();
});
