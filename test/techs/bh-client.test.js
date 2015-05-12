var fs = require('fs'),
    path = require('path'),
    mock = require('mock-fs'),
    TestNode = require('enb/lib/test/mocks/test-node'),
    FileList = require('enb/lib/file-list'),
    bhClient = require('../../techs/bh-client'),
    bhCoreFilename = require.resolve('bh/lib/bh.js'),
    htmlFilename = path.join(__dirname, '..', 'fixtures', 'bh-client', 'index.html'),
    mochaFilename = require.resolve('mocha/mocha.js'),
    chaiFilename = require.resolve('chai/chai.js'),
    writeFile = require('../lib/write-file'),
    runServer = require('../lib/run-server');

describe('bh-client', function () {
    afterEach(function () {
        mock.restore();
    });

    it('compiled files should works on client-side', function () {
        var test = generateTest({ block: 'block' }, '<a class="block"></a>');

        return runTest(test);
    });

    it('custom core', function () {
        var test = generateTest({ block: 'block' }, '^_^'),
            options = {
                bhFile: [
                    'function BH () {}',
                    'BH.prototype.apply = function() { return "^_^"; };',
                    'BH.prototype.match = function() {};',
                    'BH.prototype.setOptions = function() {};'
                ].join('\n')
            };

        return runTest(test, options);
    });

    describe('mimic', function () {
        it('mimic as a string', function () {
            var test = [
                    'chai.should();',
                    'describe("bh-client", function () {',
                        'it("autogenerated test", function () {',
                            'BEMHTML.apply({ block: "block" }).should.equal(\'<a class="block"></a>\');',
                        '})',
                    '})'
                ].join('\n'),
                options = {
                    mimic: 'BEMHTML'
                };

           return runTest(test, options);
        });

        it('mimic to different template engines', function () {
            var test = [
                    'chai.should();',
                    'describe("bh-client", function () {',
                        'it("autogenerated test", function () {',
                            'BEMHTML.apply({ block: "block" }).should.equal(\'<a class="block"></a>\');',
                            'render.apply({ block: "block" }).should.equal(\'<a class="block"></a>\');',
                        '})',
                    '})'
                ].join('\n'),
                options = {
                    mimic: ['BEMHTML', 'render']
                };

           return runTest(test, options);
        });
    });

    describe('jsAttr', function () {
        it('should use dafault jsAttrName and jsAttrScheme params', function () {
            var test = generateTest(
                { block: 'block', js: true },
                '<a class="block i-bem" data-bem=\'{"block":{}}\'></a>'
            );

           return runTest(test);
        });

        it('should use redefined jsAttrName param', function () {
            var test = generateTest(
                    { block: 'block', js: true },
                    '<a class="block i-bem" onclick=\'{"block":{}}\'></a>'
                ),
                options = {
                    jsAttrName: 'onclick'
                };

           return runTest(test, options);
        });

        it('should use redefined jsAttrScheme param', function () {
            var test = generateTest(
                    { block: 'block', js: true },
                    '<a class="block i-bem" data-bem=\'return {"block":{}}\'></a>'
                ),
                options = {
                    jsAttrScheme: 'js'
                };

           return runTest(test, options);
        });
    });

    it('dependencies', function () {
        var test = generateTest({ block: 'block' }, '<div class="block">^_^</div>'),
            options = {
                dependencies: { test: '"^_^"' }
            },
            template = 'bh.match("block", function(ctx) { ctx.content(bh.lib.test); });';

       return runTest(test, options, template);
    });

    it('sourcemap', function () {
        var options = {
                sourcemap: true,
                bhFile: 'bh.js'
            },
            scheme = {
                blocks: {},
                bundle: {},
                'bh.js': 'module.exports = BH;'
            },
            bundle, fileList;

        mock(scheme);

        bundle = new TestNode('bundle');
        fileList = new FileList();
        fileList.loadFromDirSync('blocks');
        bundle.provideTechData('?.files', fileList);

        return bundle.runTechAndGetContent(bhClient, options)
            .spread(function (bh) {
                bh.toString().must.include('sourceMappingURL');
            });
    });

    describe('caches', function () {
        var mockBhCore, scheme, bundle, fileList;

        beforeEach(function () {
            mockBhCore = [
                'function BH () {}',
                'BH.prototype.apply = function() { return "^_^"; };',
                'BH.prototype.match = function() {};',
                'BH.prototype.setOptions = function() {};'
            ].join('\n');
            scheme = {
                blocks: {},
                bundle: {},
                'index.html': fs.readFileSync(htmlFilename, 'utf-8'),
                'mocha.js': fs.readFileSync(mochaFilename, 'utf-8'),
                'chai.js': fs.readFileSync(chaiFilename, 'utf-8')
            };
        });

        it('must use cached bhFile', function () {
            scheme['test.js'] = generateTest({ block: 'block' }, '<div class="block"></div>');

            scheme[bhCoreFilename] = mock.file({
                content: fs.readFileSync(bhCoreFilename, 'utf-8'),
                mtime: new Date(1)
            });

            /*
             * Добавляем кастомное ядро с mtime для проверки кэша.
             * Если mtime кастомного ядра совпадет с mtime родного ядра,
             * то должно быть использовано родное(закешированное).
             */
            scheme['mock.bh.js'] = mock.file({
                content: mockBhCore,
                mtime: new Date(1)
            });

            mock(scheme);

            bundle = new TestNode('bundle');
            fileList = new FileList();
            fileList.loadFromDirSync('blocks');
            bundle.provideTechData('?.files', fileList);

            return bundle.runTech(bhClient)
                .then(function () {
                    return bundle.runTechAndGetContent(bhClient, { bhFile: 'mock.bh.js' });
                })
                .spread(function (bh) {
                    // TODO: удалить, когда пофиксится https://github.com/enb-make/enb/issues/224
                    fs.writeFileSync('bundle/bundle.bh.js', bh);

                    return runServer(3000);
                });
        });

        it('must rewrite cached bhFile if the new bhFile exist', function () {
            scheme['test.js'] = generateTest({ block: 'block' }, '^_^');

            scheme[bhCoreFilename] = mock.file({
                content: fs.readFileSync(bhCoreFilename, 'utf-8'),
                mtime: new Date(1)
            });

            /*
             * Добавляем кастомное ядро с mtime для проверки кэша.
             * Если mtime разные, то должно использоваться кастомное ядро
             * (кэш должен перезаписаться)
             */
            scheme['mock.bh.js'] = mock.file({
                content: mockBhCore,
                mtime: new Date(2)
            });

            mock(scheme);

            bundle = new TestNode('bundle');
            fileList = new FileList();
            fileList.loadFromDirSync('blocks');
            bundle.provideTechData('?.files', fileList);

            return bundle.runTech(bhClient)
                .then(function () {
                    return bundle.runTechAndGetContent(bhClient, { bhFile: 'mock.bh.js' });
                })
                .spread(function (bh) {
                    // TODO: удалить, когда пофиксится https://github.com/enb-make/enb/issues/224
                    fs.writeFileSync('bundle/bundle.bh.js', bh);

                    return runServer(3000);
                });
        });

        it('must ignore outdated cache of the templates', function () {
            scheme['test.js'] = generateTest({ block: 'block' }, '<b class="block"></b>');
            scheme.blocks['block.bh.js'] = bhWrap('bh.match("block", function(ctx) {ctx.tag("a");});');
            scheme[bhCoreFilename] = fs.readFileSync(bhCoreFilename, 'utf-8');

            mock(scheme);

            bundle = new TestNode('bundle');
            fileList = new FileList();
            fileList.loadFromDirSync('blocks');
            bundle.provideTechData('?.files', fileList);

            return bundle.runTech(bhClient)
                .then(function () {
                    return writeFile(
                        'blocks/block.bh.js',
                        bhWrap('bh.match("block", function(ctx) {ctx.tag("b");});')
                    );
                })
                .then(function () {
                    fileList = new FileList();
                    fileList.loadFromDirSync('blocks');
                    bundle.provideTechData('?.files', fileList);

                    return bundle.runTechAndGetContent(bhClient);
                })
                .spread(function (bh) {
                    // TODO: удалить, когда пофиксится https://github.com/enb-make/enb/issues/224
                    fs.writeFileSync('bundle/bundle.bh.js', bh);

                    return runServer(3000);
                });
        });
    });
});

function bhWrap(str) {
    return 'module.exports = function(bh) {' + str + '};';
}

function runTest(testContent, options, template) {
    var bhTemplate = bhWrap(template || 'bh.match("block", function(ctx) { ctx.tag("a"); });'),
        bundle,
        fileList,

        scheme = {
            blocks: {
                'block.bh.js': bhTemplate
            },
            bundle: {},
            'index.html': fs.readFileSync(htmlFilename, 'utf-8'),
            'test.js': testContent,
            'mocha.js': fs.readFileSync(mochaFilename, 'utf-8'),
            'chai.js': fs.readFileSync(chaiFilename, 'utf-8')
        };

    if (options && options.bhFile) {
        scheme['bh.js'] = options.bhFile;
        options.bhFile = 'bh.js';
    }

    scheme[bhCoreFilename] = fs.readFileSync(bhCoreFilename, 'utf-8');

    mock(scheme);

    bundle = new TestNode('bundle');
    fileList = new FileList();
    fileList.loadFromDirSync('blocks');
    bundle.provideTechData('?.files', fileList);

    return bundle.runTechAndGetContent(bhClient, options)
        .spread(function (bh) {
            // TODO: удалить, когда пофиксится https://github.com/enb-make/enb/issues/224
            fs.writeFileSync('bundle/bundle.bh.js', bh);

            return runServer(3000);
        });
}

function generateTest(json, expected) {
    expected = expected.replace(/'/g, '\\\'');

    return [
        'chai.should();',
        'describe("bh-client", function () {',
            'it("autogenerated test", function () {',
                'bh.apply(' + JSON.stringify(json) + ').should.equal(\'' + expected + '\');',
            '})',
        '})'
    ].join('\n');
}