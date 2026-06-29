"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sceneHeader = sceneHeader;
exports.sceneSource = sceneSource;
exports.classHeader = classHeader;
exports.classSource = classSource;
function toPascalCase(name) {
    return name
        .replace(/[_-]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
}
function sceneHeader(rawName) {
    const className = toPascalCase(rawName);
    const content = `#pragma once

#include "engine/IScene.h"

class ${className} : public IScene
{
public:
    void Init() override;
    void Update(double deltaTime) override;
    void Draw() override;
    void End() override;

private:
    double elapsed_ = 0.0;
};
`;
    return { className, content };
}
function sceneSource(rawName) {
    const className = toPascalCase(rawName);
    const content = `#include "${className}.h"
#include "DxLib.h"

void ${className}::Init()
{
    elapsed_ = 0.0;
}

void ${className}::Update(double deltaTime)
{
    elapsed_ += deltaTime;
}

void ${className}::Draw()
{
    DrawFormatString(10, 10, GetColor(255, 255, 255), "${className} (elapsed: %.1fs)", elapsed_);
}

void ${className}::End()
{
}
`;
    return { className, content };
}
function classHeader(rawName) {
    const className = toPascalCase(rawName);
    const content = `#pragma once

class ${className}
{
public:
    ${className}();
    ~${className}();

private:
};
`;
    return { className, content };
}
function classSource(rawName) {
    const className = toPascalCase(rawName);
    const content = `#include "${className}.h"

${className}::${className}()
{
}

${className}::~${className}()
{
}
`;
    return { className, content };
}
