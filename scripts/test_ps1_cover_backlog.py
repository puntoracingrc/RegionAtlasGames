"""Prevent recovered scans from being assigned to a foreign or budget edition."""
import copy
import importlib.util
import pathlib
import unittest

spec=importlib.util.spec_from_file_location('cover_backlog',pathlib.Path(__file__).with_name('apply-ps1-cover-backlog.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CoverAssignmentTests(unittest.TestCase):
    def setUp(self):
        self.game={'regionalStatus':'resolved','regionCode':'ES','canonicalSerials':['SLES-03225']}
        self.front={'stored':True,'label':'FRONT','roles':['front_cover'],'sourceImageReference':'https://psxdatacenter.com/images/hires/P/D/SLES-03225/SLES-03225-F-ALL.html','marketHints':['ES'],'group':'- Jewel Case Covers'}

    def candidates(self,**change):
        image={**self.front,**change}
        return module.matching_fronts(self.game,{'graphics':[image]})

    def test_exact_standard_front_is_eligible(self):self.assertEqual(len(self.candidates()),1)
    def test_foreign_or_multimarket_packaging_is_not_selected(self):
        for market in [['EU'],['ES','PT'],[]]:self.assertEqual(self.candidates(marketHints=market),[])
    def test_platinum_and_alternate_fronts_stay_gallery_only(self):
        for label in ['PLATINUM FRONT','GREATEST HITS FRONT','ALTERNATE FRONT','BOX FRONT']:
            self.assertEqual(self.candidates(label=label),[])
    def test_wrong_serial_and_back_cannot_be_main_cover(self):
        self.assertEqual(self.candidates(sourceImageReference='https://psxdatacenter.com/images/covers/SLES-03221-F-ALL.jpg'),[])
        self.assertEqual(self.candidates(roles=['back_cover'],label='BACK'),[])
    def test_unresolved_or_unstored_evidence_cannot_select_cover(self):
        self.assertEqual(self.candidates(stored=False),[])
        self.game['regionalStatus']='review'
        self.assertEqual(self.candidates(),[])
    def test_multiple_fronts_remain_ambiguous(self):
        self.assertEqual(len(module.matching_fronts(self.game,{'graphics':[self.front,copy.deepcopy(self.front)]})),2)

if __name__=='__main__':unittest.main()
