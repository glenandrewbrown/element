# Building Element
A simple guide on building Element with CMake.  Pease see [cmake.org](https://cmake.org/install/) for how to install CMake on your platform.

## Dependencies and Submodules

JUCE and sol2 are fetched automatically via CMake FetchContent during configuration. You do not need to run `git submodule update` for those dependencies.

The `clap-juce-extensions` submodule is still required. Initialize it with:

```bash
git submodule update --init --recursive
```

## Debian/Ubuntu
__Dependencies__

The following packages are needed...
```bash
sudo apt-get install git build-essential pkg-config libboost-dev \
    libfreetype-dev libx11-dev libxext-dev libxrandr-dev libxcomposite-dev \
    libxinerama-dev libxrender-dev libxcursor-dev libxrender-dev libasound2-dev \
    ladspa-sdk libcurl4-openssl-dev fonts-roboto clang clang++
```

__Compiling__
```
cmake -B build -G Ninja
cmake --build build
```

__Installing__
```
sudo cmake --install build
sudo ldconfig
```

## Arch Linux
Install these packages, then run the `cmake` commands described above.

```bash
sudo pacman -S git base-devel cmake ninja pkgconf boost \
    freetype2 fontconfig libx11 libxext libxrandr libxcomposite \
    libxinerama libxrender libxcursor alsa-lib jack2 \
    ladspa curl ttf-roboto clang
```

### Checking With Docker

You can also build in a Docker container without installing packages on your system:

```bash
# Build the Arch Linux environment image
docker build -f Dockerfile.archlinux -t element:archlinux .

# Build the project with your source mounted as a volume
docker run --rm --user $(id -u):$(id -g) -v $(pwd):/workspace element:archlinux bash -c "
  git config --global --add safe.directory /workspace && \
  git submodule update --init --recursive && \
  cmake -B build-arch -G Ninja -DCMAKE_BUILD_TYPE=Release -DELEMENT_BUILD_PLUGINS=ON && \
  cmake --build build-arch && \
  ctest --test-dir build-arch --output-on-failure
"
```

Or run interactively:
```bash
docker run --rm -it --user $(id -u):$(id -g) -v $(pwd):/workspace element:archlinux
# Then run cmake commands manually inside the container
```


## Mac OSX
__Dependencies__

Install [Boost](https://www.boost.org/) using [Homebrew](https://docs.brew.sh/).
```
brew install boost
```

__Build__
```
cmake -B build
cmake --build build
```

To target macOS 14.0 (Sonoma) and later, pass the deployment target explicitly:

```bash
cmake -B build -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
cmake --build build
```

This will make an app bundle somwhere in the `build` dir.  Run it...
```
open $(find build -name "Element.app")
```

## Windows (MSVC)

```
cmake -B build
cmake --build build
```

After this, you should have an `Element.exe` inside the `build` directory.

## Building the macOS Installer

To produce a distributable DMG, use the installer script. The script takes the version string, the path to your release build directory, and an output directory.

```bash
bash installer/build_pkg.sh 1.1.0 build-release installer/output
```

The resulting DMG will be placed in `installer/output/`.

## Code Signing (macOS, Optional)

To sign the application bundle during the build, set the `DEVELOPER_ID_APP` environment variable to your Developer ID Application certificate name before configuring or building:

```bash
export DEVELOPER_ID_APP="Developer ID Application: Your Name (TEAMID)"
cmake -B build -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
cmake --build build
```

Notarization is handled separately by the installer script when `DEVELOPER_ID_APP` is present in the environment.
