# Evidence 07 — Actual Records Retrieved

Population used: the 332 `configurator.components_sot_skus` rows where `source_tab='ceilingrose'`
(219 CRSF + 113 CRFF), joined to `inventory.products` on SKU. All 332 matched.

## Field-presence counts (row exists in `physical_product_stock` for that warehouse)

| Field | CRSF (of 219) | CRFF (of 113) |
|---|---|---|
| Matched in `inventory.products` | 219 | 113 |
| Unit 3 stock row | 219 | 113 |
| Unit 3 location non-null | 196 | 111 |
| Unit 4 stock row | 219 | 113 |
| Unit 4 location non-null | 191 | 113 |
| Unit 18 stock row | 219 | 113 |
| **Unit 18 location non-null** | **0** | **0** |
| Kronen stock row | 219 | 113 |
| **Kronen location non-null** | **0** | **0** |
| Schmutter stock row | 219 | 113 |
| Schmutter location non-null | 143 | 38 |
| Canada stock row | 219 | 113 |
| US stock row | 218 | 113 |
| Image | 219 | 113 |

## CRSF extract (first 20 by SKU)

| SKU | inv_id | U3 | U3 loc | U4 | U4 loc | U18 | Kronen | Schmutter | Schm loc | CA | US | rollup UK | UK price min–max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CRSF10025BM | 2559 | 0 | 2-C-14-B | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 0 | 4.99–6.59 |
| CRSF10025WH | 2560 | 0 | 2-C-14-B | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 0 | 6.19–6.59 |
| CRSF10030BY | 568 | 0 | L-A-03-B | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 0 | none |
| CRSF10030CO | 571 | 1 | L-A-03-B | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 1 | none |
| CRSF10030GB | 569 | 5 | L-A-03-B | 0 | - | 0 | 0 | 0 | R1-S05-E | 0 | 0 | 5 | none |
| CRSF10030YB | 570 | 0 | L-A-03-B | 0 | - | 0 | 0 | 0 | R1-S05-E | 0 | 0 | 0 | 2.45–2.45 |
| CRSF100AA | 1189 | 92 | 3-E-01 | 98 | 2-F-02-C | 0 | 0 | 0 | R2-S15-B | 0 | 0 | 190 | 4.49–4.99 |
| CRSF100BB | 321 | 162 | 3-E-01 | 0 | - | 0 | 0 | 134 | R2-S15-B | 70 | 0 | 162 | 3.45–3.99 |
| CRSF100BC | 323 | 759 | 3-E-02-A | 0 | 1-J-10-C | 0 | 0 | **-7** | R2-S15-B | 79 | 0 | 753 | 3.99–7.90 |
| CRSF100BD | 3126 | 0 | L-B-17 | 0 | 1-E-02-B | 0 | 0 | 78 | R2-S15-B | 0 | 0 | 0 | 2.45–3.99 |
| CRSF100BL | 339 | 386 | L-B-17 | 5 | 1-D-02-C | 0 | 0 | **-4** | R2-S15-B | **-4** | 0 | 391 | 3.99–7.90 |
| CRSF100BM | 344 | 2264 | 1-F-01 | 1071 | 1-P | 5700 | 0 | 3839 | R1-S08 | 0 | **-11** | **9005** *(vs 9035 summed)* | 3.99–7.90 |
| CRSF100BS | 324 | 77 | 3-E-01 | 0 | 1-J-10-C | 300 | 0 | 56 | R2-S15-B | 67 | 0 | 377 | 3.99–7.90 |
| CRSF100BU | 3129 | 186 | L-B-17 | 0 | 1-E-02-B | 0 | 0 | **-1** | R2-S15-B | 0 | 0 | 186 | 3.99–7.90 |
| CRSF100CB | 38414 | 113 | L-B-17 | 0 | L-B-17 | 0 | 0 | 0 | NULL | 0 | 0 | 113 | none |
| CRSF100CH | 689 | 337 | 1-F-01 | 0 | 1-H-02 | 1100 | **-1** | 634 | R1-S08 | 69 | 0 | 1435 | 3.19–7.90 |
| CRSF100CO | 341 | 93 | 1-F-01 | 1051 | 1-H-02 | 1300 | 0 | 626 | R1-S08 | 99 | 0 | 2442 | 3.19–4.49 |
| CRSF100CY | 1190 | 186 | 3-E-01 | 50 | 2-F-02-D | 0 | 0 | 4 | R2-S15-B | 0 | 0 | 236 | 4.49–4.99 |
| CRSF100FG | 616 | 220 | 1-F-01 | 0 | 1-H-02-B | 600 | 0 | 85 | R1-S05-E | 0 | 0 | 818 | 3.19–4.49 |
| CRSF100GB | 338 | 31 | 1-F-01 | 632 | 1-H-02 | 500 | 0 | 343 | R1-S08 | 99 | 0 | 1157 | 3.19–7.90 |

## CRFF extract (first 20 by SKU)

| SKU | inv_id | U3 | U3 loc | U4 | U4 loc | U18 | Kronen | Schmutter | Schm loc | CA | US | rollup UK | UK price min–max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CRFF10020BA | 2905 | 0 | L-A-02-A | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 0 | 5.19–5.19 |
| CRFF10020CH | 2529 | 0 | L-A-04-A | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 0 | 1.75–5.19 |
| CRFF10020RO | 1988 | 78 | L-A-04-A | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 78 | 1.75–5.19 |
| CRFF10020SN | 1987 | 52 | L-A-04-A | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 52 | 1.75–5.19 |
| CRFF10020YB | 2528 | 0 | L-A-02-A | 0 | - | 0 | 0 | 0 | NULL | 0 | 0 | 0 | 1.75–5.19 |
| CRFF100BM | 668 | 799 | 1-F-03 | 160 | 1-I-08-B | 900 | 0 | 293 | R1-S05-E | 30 | **-2** | **1846** *(vs 1859 summed)* | 5.99–5.99 |
| CRFF100BY | 1984 | 0 | 1-F-03 | 0 | 1-I-08-B | 0 | 0 | 0 | NULL | 0 | 0 | 0 | 2.45–5.99 |
| CRFF100CH | 669 | 258 | 1-F-03-D | 0 | 1-I-08-B | 200 | 0 | 97 | R1-S05-E | 0 | 0 | 455 | 3.49–5.99 |
| CRFF100CO | 667 | 117 | 1-F-03 | 47 | 1-I-08-B | 100 | 0 | **-1** | NULL | 0 | 0 | 264 | 5.99–5.99 |
| CRFF100FG | 1461 | 22 | 1-F-03 | 5 | 1-I-08-B | 100 | 0 | 100 | R1-S05-E | 0 | 0 | 126 | 2.99–5.99 |
| CRFF100GB | 660 | 84 | 1-F-03 | 0 | 1-I-08-B | 0 | 0 | 50 | R1-S05-E | 0 | 0 | 83 | 5.99–5.99 |
| CRFF100RO | 661 | 374 | 1-F-03 | 0 | 1-I-08-B | 0 | 0 | **-1** | NULL | 0 | 0 | 374 | 2.45–4.37 |
| CRFF100SN | 1950 | 156 | 1-F-03 | 0 | 1-I-08-B | 0 | 0 | 0 | NULL | 0 | 0 | 156 | 2.45–5.99 |
| CRFF100WH | 665 | 196 | 1-F-03 | 0 | 1-I-08-B | 100 | 0 | 56 | R1-S05-E | 0 | 0 | 296 | 5.99–5.99 |
| CRFF100WO | 1838 | **-19** | L-B-13-B | 0 | 1-I-08-B | 0 | 0 | **-1** | NULL | 0 | 0 | 0 | none |
| CRFF100YB | 666 | 69 | 1-F-03-D | 0 | 1-I-08-B | 0 | 0 | **-2** | R1-S05-E | **-2** | 0 | 69 | 5.48–5.99 |
| CRFF105BA | 3477 | 460 | L-B-07-B | 0 | 1-H-02-C | 0 | 0 | 9 | NULL | 0 | 0 | 460 | 4.69–5.89 |
| CRFF105BY | 3476 | 115 | L-B-07-C | 0 | 1-H-02-C | 0 | 0 | 87 | NULL | 0 | 0 | 115 | 4.69–5.89 |
| CRFF105CH | 2453 | 295 | L-A-06 | **-2** | 1-H-02-C | 100 | 0 | **-1** | NULL | 0 | 0 | 392 | 4.69–5.89 |
| CRFF105CO | 1315 | 194 | L-A-06 | 33 | 1-H-02-C | 200 | 0 | 49 | NULL | 0 | 0 | 427 | 4.69–5.89 |

## Aggregate stock by warehouse (all prefix-matched CR SKUs, incl. bundles)

| Prefix | Warehouse | rows | Σ qty | qty>0 | qty=0 | qty<0 |
|---|---|---|---|---|---|---|
| CRSF | UK Unit3 (1) | 543 | 28,300 | 231 | 284 | 28 |
| CRSF | UK Unit4 (8) | 542 | 169,467 | 275 | 242 | 25 |
| CRSF | UK Unit18 (6) | 543 | 16,003 | 31 | 512 | 0 |
| CRSF | Kronen (10) | 542 | 346 | 8 | 531 | 3 |
| CRSF | Schmutter (7) | 542 | 18,460 | 109 | 407 | 26 |
| CRSF | Canada1 (4) | 231 | 2,062 | 29 | 194 | 8 |
| CRSF | US1 (32) | 228 | 3,782 | 7 | 217 | 4 |
| CRSF | **33 (undefined)** | 99 | 0 | 0 | 99 | 0 |
| CRFF | UK Unit3 (1) | 146 | 12,767 | 94 | 39 | 13 |
| CRFF | UK Unit4 (8) | 146 | 6,066 | 51 | 89 | 6 |
| CRFF | UK Unit18 (6) | 146 | 4,035 | 17 | 129 | 0 |
| CRFF | Kronen (10) | 146 | -6 | 0 | 144 | 2 |
| CRFF | Schmutter (7) | 146 | 3,847 | 27 | 98 | 21 |
| CRFF | Canada1 (4) | 115 | 542 | 3 | 109 | 3 |
| CRFF | US1 (32) | 115 | 855 | 5 | 108 | 2 |
| CRFF | **33 (undefined)** | 63 | 0 | 0 | 63 | 0 |
