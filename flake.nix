{
  description = "openlv devshell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
      };
    in {
      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          just
          nodejs_24
          pnpm_11
        ];

        env = {
          # Nix-built browsers for the vitest browser-mode tests; the ones
          # playwright downloads itself cannot run on NixOS. Keep the npm
          # `playwright` version in sync with nixpkgs' playwright-driver.
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        };

        shellHook = ''
          just
        '';
      };
    });
}
