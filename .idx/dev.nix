# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.nodePackages.node-gyp
  ];

  # Sets environment variables in the workspace
  env = {};
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      # "vscodevim.vim"
    ];

    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        install-dependencies = "npm install";
        # "npm install" is a common command to install dependencies in Node.js projects.
        # It reads the "package.json" file and downloads the required packages.
      };

      # Runs when a workspace is started
      onStart = {
        # "npm start" is a common command to start a Node.js application.
        # The actual command that runs is defined in the "scripts" section of "package.json".
        start-app = "npm start";
      };
    };

    # VS Code settings
    vscode = {
      settings = {
        "editor.formatOnSave" = true;
      };
    };
  };
}
