import os
from pathlib import Path
from jinja2 import Environment, FileSystemLoader


def to_bool(boolean_variable) -> bool:
    if type(boolean_variable) is str:
        return boolean_variable.lower() == "true"
    return boolean_variable


def generate_configs(
    config_dir: str,
    controller_url: str,
    identity_provider_url: str | None,
    is_juju: bool,
    dashboard_root: str,
    analytics_enabled: bool,
    port: int,
):
    """
    Given data from the controller relation, render config templates.
    Returns the dashboard and nginx template as strings.
    """
    env = Environment(loader=FileSystemLoader(config_dir))
    env.filters["bool"] = to_bool
    config_template = env.get_template("config.js.j2")
    config = config_template.render(
        base_app_url="/",
        controller_api_endpoint=f"{'' if is_juju else controller_url}/api",
        identity_provider_url=identity_provider_url,
        is_juju=is_juju,
        analytics_enabled=analytics_enabled,
    )
    nginx_template = env.get_template("nginx.conf.j2")
    nginx_config = nginx_template.render(
        # nginx proxy_pass expects the protocol to be https
        controller_ws_api=controller_url.replace("wss://", "https://"),
        dashboard_root=dashboard_root,
        port=port,
        is_juju=is_juju,
    )
    return config, nginx_config


if __name__ == "__main__":
    controller_url = os.environ.get("DASHBOARD_CONTROLLER_URL")
    if controller_url is None:
        raise Exception("DASHBOARD_CONTROLLER_URL environment variable not provided")
    dashboard_root = getattr(os.environ, "DASHBOARD_ROOT", "/srv")
    dashboard_config, nginx_config = generate_configs(
        config_dir=os.environ.get("DASHBOARD_CONFIG_DIR", "/srv"),
        controller_url=controller_url,
        identity_provider_url=os.environ.get("DASHBOARD_IDENTITY_PROVIDER_URL", None),
        is_juju=to_bool(os.environ.get("DASHBOARD_IS_JUJU", True)),
        analytics_enabled=to_bool(os.environ.get("DASHBOARD_ANALYTICS_ENABLED", True)),
        dashboard_root=dashboard_root,
        port=int(os.environ.get("DASHBOARD_PORT", 8080)),
    )
    config_path = Path(dashboard_root) / "config.js"
    config_path.write_text(dashboard_config)
    nginx_path = Path("/etc/nginx/sites-available/default")
    nginx_path.write_text(nginx_config)
