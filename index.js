$(document).ready(function() {
    const csvFiles = ['사양견적관리.csv', '견적관련db.csv'];
    const db = {}; // 데이터를 저장할 전역 객체

    // 1. CSV 데이터 로드 및 파싱 (최초 1회)
    async function loadData() {
        try {
            const responses = await Promise.all(csvFiles.map(file => fetch(file)));
            const csvTexts = await Promise.all(responses.map(res => res.text()));

            csvTexts.forEach(text => parseCSV(text));

            // 데이터 가공 함수들 순차적 호출
            precomputeFullSpecText();
            precomputeAvgActualCost();
            precomputeHashes();
            
            console.log("모든 데이터 준비 완료:", db);

            // 데이터 로드 후 첫 페이지 로드
            loadInitialPage();
        } catch (error) {
            console.error("데이터 로딩 또는 가공 실패:", error);
            alert("기준 데이터 파일을 불러오거나 처리하는 데 실패했습니다.");
        }
    }

    function parseCSV(csvText) {
        // Helper function to correctly parse a single CSV line, handling commas within quotes.
        function parseCsvLine(row) {
            const quoted = /"[^"]+"/g;
            const COMMA_REPLACEMENT = '##COMMA##'; // A unique string to temporarily replace commas

            // Temporarily replace commas inside quoted fields
            const tempRow = row.replace(quoted, (match) => {
                return match.replace(/,/g, COMMA_REPLACEMENT);
            });

            // Split the row by commas
            const columns = tempRow.split(',');

            // Restore the commas in the fields and remove the quotes
            return columns.map((col) => {
                return col.replace(/"/g, '').replace(new RegExp(COMMA_REPLACEMENT, 'g'), ',').trim();
            });
        }

        let currentTableName = null, headers = [];
        const lines = csvText.split(/\r\n|\n/).map(line => line.trim());
        
        for (const line of lines) {
            if (!line.trim()) { currentTableName = null; headers = []; continue; }
            
            const columns = parseCsvLine(line);

            const potentialTableName = columns[0];
            const isTableDefinition = columns.length > 1 && columns.slice(1).every(c => c === '');

            if (isTableDefinition) {
                currentTableName = potentialTableName;
                db[currentTableName] = []; // 새 테이블 초기화
                headers = [];
                continue;
            }

            if (currentTableName) {
                if (headers.length === 0) {
                    headers = columns.filter(h => h);
                } else {
                    const record = {};
                    headers.forEach((h, i) => { if (columns[i]) record[h] = columns[i]; });
                    if (Object.keys(record).length > 0) db[currentTableName].push(record);
                }
            }
        }
    }

    // '항목명:값' 형식의 전체 스펙 텍스트 미리 계산
    function precomputeFullSpecText() {
        db.unitFullSpecText = {};
        if (!db.유닛품번리스트 || !db.유닛품번스펙정보) return;

        db.유닛품번리스트.forEach(part => {
            const specTexts = db.유닛품번스펙정보
                .filter(s => String(s.유닛품번코드) === String(part.유닛품번코드))
                .sort((a, b) => a.스펙항목코드.localeCompare(b.스펙항목코드)) // 항목 순서 고정
                .map(s => `${s.스펙항목명}:${s.스펙명}`)
                .join(' / ');
            
            if (specTexts) {
                db.unitFullSpecText[part.유닛품번코드] = specTexts;
            }
        });
        console.log("전체 스펙 텍스트 계산 완료:", db.unitFullSpecText);
    }

    // 실적원가 6개월 평균 미리 계산
    function precomputeAvgActualCost() {
        db.avgActualCosts = {};
        if (!db.유닛품번실적원가) return;

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const costsByPart = {};

        db.유닛품번실적원가.forEach(record => {
            const year = parseInt(String(record.년월).substring(0, 4), 10);
            const month = parseInt(String(record.년월).substring(4, 6), 10) - 1;
            const recordDate = new Date(year, month);

            if (recordDate >= sixMonthsAgo) {
                if (!costsByPart[record.유닛품번코드]) {
                    costsByPart[record.유닛품번코드] = {
                        direct: [], indirect: [], outsourced: [], internal: []
                    };
                }
                costsByPart[record.유닛품번코드].direct.push(parseFloat(record.직접재료비) || 0);
                costsByPart[record.유닛품번코드].indirect.push(parseFloat(record.간접재료비) || 0);
                costsByPart[record.유닛품번코드].outsourced.push(parseFloat(record.외주임가공공수) || 0);
                costsByPart[record.유닛품번코드].internal.push(parseFloat(record.본사가공공수) || 0);
            }
        });

        const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        for (const partCode in costsByPart) {
            db.avgActualCosts[partCode] = {
                직접재료비: avg(costsByPart[partCode].direct),
                간접재료비: avg(costsByPart[partCode].indirect),
                외주임가공공수: avg(costsByPart[partCode].outsourced),
                본사가공공수: avg(costsByPart[partCode].internal)
            };
        }
        console.log("6개월 평균 실적원가 계산 완료:", db.avgActualCosts);
    }

    // 스펙 해시 미리 계산 (사양 검색용)
    function precomputeHashes() {
        db.unitSpecHashes = {};
        if (!db.유닛품번리스트 || !db.유닛품번스펙정보) return;

        db.유닛품번리스트.forEach(part => {
            const specs = db.유닛품번스펙정보
                .filter(s => String(s.유닛품번코드) === String(part.유닛품번코드))
                .map(s => s.스펙코드)
                .sort()
                .join('-');
            if (specs) {
                db.unitSpecHashes[part.유닛품번코드] = specs;
            }
        });
        console.log("스펙 해시 계산 완료:", db.unitSpecHashes);
    }


    // 2. 네비게이션 이벤트 핸들러
    // GNB 메뉴 클릭
    $('.gnb-item').on('click', function() {
        const menu = $(this).data('menu');

        // GNB 활성 상태 변경
        $('.gnb-item').removeClass('active');
        $(this).addClass('active');

        // LNB 메뉴 변경
        $('.lnb-menu').removeClass('active');
        $(`#lnb-${menu}`).addClass('active');

        // 해당 LNB의 첫 번째 메뉴를 기본으로 로드
        $(`#lnb-${menu} li:first`).click();
    });

    // LNB 메뉴 클릭
    $('.lnb li').on('click', function() {
        const pageSrc = $(this).data('src');
        if (!pageSrc) return;

        // LNB 활성 상태 변경
        $('.lnb li').removeClass('active');
        $(this).addClass('active');

        // Iframe에 페이지 로드
        $('iframe[name="content-frame"]').attr('src', pageSrc);
    });

    $('#lnb-toggle-btn').on('click', function() {
        $('.container').toggleClass('lnb-collapsed');
    });

    // 3. Iframe 로드 완료 후 데이터 전달
    $('iframe[name="content-frame"]').on('load', function() {
        const iframe = this;
        // iframe 내부 페이지에 db 객체 전달 및 초기화 함수 호출
        if (iframe.contentWindow) {
            iframe.contentWindow.db = db;
            if (typeof iframe.contentWindow.initializePage === 'function') {
                iframe.contentWindow.initializePage(db);
            }
        }
    });

    // 4. 초기화
    function loadInitialPage() {
        // 첫 번째 GNB 메뉴의 첫 번째 LNB 메뉴를 클릭
        $('.gnb-item[data-menu="spec"]').click();
    }

    loadData(); // 시작!
});